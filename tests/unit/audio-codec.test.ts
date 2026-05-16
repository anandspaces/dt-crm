import { describe, expect, it } from "bun:test";
import {
	bufferToPCM16,
	chunkBuffer,
	muLawToPCM16,
	pcm16ToBuffer,
	pcm16ToMuLaw,
	resamplePCM16,
} from "../../src/shared/utils/audio-codec";

describe("audio-codec — muLaw ↔ PCM16", () => {
	it("decodes the silence codes (0x7F and 0xFF) to zero magnitude", () => {
		// Both 0x7F (positive zero) and 0xFF (negative zero) represent silence.
		const pcm = muLawToPCM16(Buffer.from([0x7f, 0xff, 0x7f, 0xff]));
		expect(pcm.length).toBe(4);
		for (const sample of pcm) {
			expect(Math.abs(sample)).toBeLessThan(50);
		}
	});

	it("encodes PCM zero to a recognized silence μ-law byte", () => {
		const mulaw = pcm16ToMuLaw(new Int16Array([0]));
		expect(mulaw.length).toBe(1);
		// PCM 0 should encode to either 0x7F (positive zero) or 0xFF (negative zero).
		expect([0x7f, 0xff]).toContain(mulaw[0] ?? -1);
	});

	it("encodes large positive samples with the high bit set (this impl's convention)", () => {
		// After bitwise NOT, the sign bit gets flipped — so positive PCM ends up
		// with the MSB set in the final byte under this codec's convention.
		const pcm = new Int16Array([32000]);
		const mulaw = pcm16ToMuLaw(pcm);
		expect(mulaw.length).toBe(1);
		expect((mulaw[0] ?? 0) & 0x80).toBe(0x80);
	});

	it("encodes large negative samples with the high bit clear", () => {
		const pcm = new Int16Array([-32000]);
		const mulaw = pcm16ToMuLaw(pcm);
		expect(mulaw.length).toBe(1);
		expect((mulaw[0] ?? 0) & 0x80).toBe(0);
	});

	it("clamps amplitudes beyond MU_LAW_CLIP without throwing", () => {
		const pcm = new Int16Array([32767, -32768]);
		const mulaw = pcm16ToMuLaw(pcm);
		expect(mulaw.length).toBe(2);
	});

	it("roundtrip pcm → mulaw → pcm preserves sign and approximate magnitude", () => {
		const original = new Int16Array([1000, -1500, 8000, -8000, 16000, -16000]);
		const mulaw = pcm16ToMuLaw(original);
		const back = muLawToPCM16(mulaw);
		expect(back.length).toBe(original.length);
		for (let i = 0; i < original.length; i += 1) {
			const orig = original[i] ?? 0;
			const decoded = back[i] ?? 0;
			// μ-law is lossy but preserves sign.
			expect(Math.sign(decoded)).toBe(Math.sign(orig));
			// Within ~12.5% relative error for mid-range samples.
			const tolerance = Math.max(200, Math.abs(orig) * 0.15);
			expect(Math.abs(decoded - orig)).toBeLessThan(tolerance);
		}
	});
});

describe("audio-codec — Buffer ↔ PCM16", () => {
	it("bufferToPCM16 then pcm16ToBuffer round-trips exactly", () => {
		const samples = new Int16Array([0, 1, -1, 1000, -1000, 32767, -32768]);
		const buf = pcm16ToBuffer(samples);
		expect(buf.length).toBe(samples.length * 2);
		const back = bufferToPCM16(buf);
		expect(Array.from(back)).toEqual(Array.from(samples));
	});

	it("pcm16ToBuffer writes little-endian", () => {
		// 0x0102 should serialize as [0x02, 0x01] in LE
		const samples = new Int16Array([0x0102]);
		const buf = pcm16ToBuffer(samples);
		expect(buf[0]).toBe(0x02);
		expect(buf[1]).toBe(0x01);
	});

	it("bufferToPCM16 reads little-endian", () => {
		// Bytes [0x34, 0x12] LE → 0x1234 (4660)
		const buf = Buffer.from([0x34, 0x12]);
		const pcm = bufferToPCM16(buf);
		expect(pcm[0]).toBe(0x1234);
	});

	it("bufferToPCM16 handles odd-length buffer by truncating", () => {
		// 3 bytes → only 1 complete int16 sample
		const buf = Buffer.from([0x01, 0x02, 0x03]);
		const pcm = bufferToPCM16(buf);
		expect(pcm.length).toBe(1);
	});
});

describe("audio-codec — resamplePCM16", () => {
	it("returns the same buffer when rates are equal", () => {
		const samples = new Int16Array([1, 2, 3, 4]);
		const out = resamplePCM16(samples, 8000, 8000);
		expect(out).toBe(samples);
	});

	it("upsamples 8 kHz → 16 kHz to approximately 2x length", () => {
		const samples = new Int16Array(80); // 10 ms @ 8 kHz
		for (let i = 0; i < samples.length; i += 1) samples[i] = i * 100;
		const out = resamplePCM16(samples, 8000, 16000);
		expect(out.length).toBeGreaterThanOrEqual(samples.length * 2 - 2);
		expect(out.length).toBeLessThanOrEqual(samples.length * 2 + 2);
	});

	it("downsamples 24 kHz → 8 kHz to approximately 1/3 length", () => {
		const samples = new Int16Array(240); // 10 ms @ 24 kHz
		for (let i = 0; i < samples.length; i += 1) samples[i] = i;
		const out = resamplePCM16(samples, 24000, 8000);
		// Floor of 240/3 = 80; allow small implementation-dependent variance.
		expect(out.length).toBeGreaterThanOrEqual(78);
		expect(out.length).toBeLessThanOrEqual(82);
	});

	it("returns empty for empty input", () => {
		const out = resamplePCM16(new Int16Array(0), 8000, 16000);
		expect(out.length).toBe(0);
	});

	it("preserves endpoint values approximately", () => {
		const samples = new Int16Array([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000]);
		const out = resamplePCM16(samples, 8000, 16000);
		expect(out[0]).toBe(0);
		// Last sample should be near the input's last value
		expect(Math.abs((out[out.length - 1] ?? 0) - 7000)).toBeLessThan(500);
	});
});

describe("audio-codec — chunkBuffer", () => {
	it("splits a buffer into 160-byte chunks (one 20 ms muLaw frame)", () => {
		const buf = Buffer.alloc(800); // 5 frames worth
		const chunks = chunkBuffer(buf, 160);
		expect(chunks.length).toBe(5);
		for (const c of chunks) expect(c.length).toBe(160);
	});

	it("last chunk may be shorter when buffer is not a multiple", () => {
		const buf = Buffer.alloc(170);
		const chunks = chunkBuffer(buf, 160);
		expect(chunks.length).toBe(2);
		expect(chunks[0]?.length).toBe(160);
		expect(chunks[1]?.length).toBe(10);
	});

	it("returns the whole buffer when chunkSize ≤ 0", () => {
		const buf = Buffer.alloc(50);
		expect(chunkBuffer(buf, 0)).toEqual([buf]);
		expect(chunkBuffer(buf, -1)).toEqual([buf]);
	});

	it("returns empty array for empty buffer", () => {
		expect(chunkBuffer(Buffer.alloc(0), 160)).toEqual([]);
	});
});
