// G.711 μ-law (mu-law) ↔ PCM16 codec + resampling helpers.
//
// Used by the calling pipeline:
//   Vobiz → server :  muLaw/8 kHz → PCM16/8 kHz → PCM16/16 kHz (Gemini Live in)
//   server → Vobiz :  PCM16/24 kHz (Gemini Live out) → PCM16/8 kHz → muLaw/8 kHz
//
// Pure math; no Node-only APIs. Works under Bun unchanged.

const MU_LAW_BIAS = 0x84;
const MU_LAW_CLIP = 32635;

/** Encode one 16-bit signed PCM sample to one μ-law byte. */
function linearToMuLawSample(sample: number): number {
	let s = sample;
	const sign = s < 0 ? 0x80 : 0x00;
	if (s < 0) s = -s;
	if (s > MU_LAW_CLIP) s = MU_LAW_CLIP;
	s += MU_LAW_BIAS;

	let segment = 7;
	for (let mask = 0x4000; (s & mask) === 0 && segment > 0; mask >>= 1) {
		segment -= 1;
	}

	const mantissa = (s >> (segment + 3)) & 0x0f;
	return ~(sign | (segment << 4) | mantissa) & 0xff;
}

/** Decode one μ-law byte to one 16-bit signed PCM sample. */
function muLawToLinearSample(muLaw: number): number {
	const u = ~muLaw & 0xff;
	const sign = u & 0x80;
	const segment = (u >> 4) & 0x07;
	const mantissa = u & 0x0f;
	let sample = ((mantissa << 3) + MU_LAW_BIAS) << segment;
	sample -= MU_LAW_BIAS;
	return sign ? -sample : sample;
}

export function muLawToPCM16(buffer: Buffer): Int16Array {
	const out = new Int16Array(buffer.length);
	for (let i = 0; i < buffer.length; i += 1) {
		out[i] = muLawToLinearSample(buffer[i] ?? 0);
	}
	return out;
}

export function pcm16ToMuLaw(samples: Int16Array): Buffer {
	const out = Buffer.allocUnsafe(samples.length);
	for (let i = 0; i < samples.length; i += 1) {
		out[i] = linearToMuLawSample(samples[i] ?? 0);
	}
	return out;
}

/** Reinterpret a Buffer of little-endian int16 bytes as an Int16Array view. */
export function bufferToPCM16(buffer: Buffer): Int16Array {
	const view = new Int16Array(buffer.length >>> 1);
	for (let i = 0; i < view.length; i += 1) {
		view[i] = buffer.readInt16LE(i * 2);
	}
	return view;
}

export function pcm16ToBuffer(samples: Int16Array): Buffer {
	const out = Buffer.allocUnsafe(samples.length * 2);
	for (let i = 0; i < samples.length; i += 1) {
		out.writeInt16LE(samples[i] ?? 0, i * 2);
	}
	return out;
}

/** Linear-interpolation resampler. Good enough for telephony voice; not for music. */
export function resamplePCM16(
	samples: Int16Array,
	inputRate: number,
	outputRate: number,
): Int16Array {
	if (inputRate === outputRate) return samples;
	if (samples.length === 0) return samples;

	const ratio = inputRate / outputRate;
	const outLength = Math.floor(samples.length / ratio);
	const out = new Int16Array(outLength);

	for (let i = 0; i < outLength; i += 1) {
		const srcIndex = i * ratio;
		const i0 = Math.floor(srcIndex);
		const i1 = Math.min(i0 + 1, samples.length - 1);
		const t = srcIndex - i0;
		const s0 = samples[i0] ?? 0;
		const s1 = samples[i1] ?? 0;
		out[i] = Math.round(s0 * (1 - t) + s1 * t);
	}

	return out;
}

/** Split a Buffer into fixed-size chunks. Final chunk may be shorter. */
export function chunkBuffer(buffer: Buffer, chunkSize: number): Buffer[] {
	if (chunkSize <= 0) return [buffer];
	const out: Buffer[] = [];
	for (let offset = 0; offset < buffer.length; offset += chunkSize) {
		out.push(buffer.subarray(offset, offset + chunkSize));
	}
	return out;
}
