import { describe, expect, it, mock } from "bun:test";
import { handleVoiceStreamMessage } from "../../src/modules/voice-stream/voice-stream.handler";
import type { VoiceStreamData } from "../../src/modules/voice-stream/voice-stream.handler";

interface FakeWS {
	data: VoiceStreamData;
	send: ReturnType<typeof mock>;
	close: ReturnType<typeof mock>;
}

function freshWs(): FakeWS {
	const sendAudio = mock(() => {});
	const closeFn = mock(async () => {});
	return {
		data: {
			batchId: "b1",
			itemId: "i1",
			userId: "u1",
			callUuid: "cu1",
			streamId: "",
			transcript: [],
			// liveSession stub — supports .sendAudio and .close
			liveSession: { sendAudio, close: closeFn },
			closing: false,
			artifactDir: "",
		},
		send: mock(() => {}),
		close: mock(() => {}),
	};
}

describe("voice-stream — handleVoiceStreamMessage", () => {
	it("ignores invalid JSON without throwing", () => {
		const ws = freshWs();
		// biome-ignore lint/suspicious/noExplicitAny: minimal ws stub for unit test
		handleVoiceStreamMessage(ws as any, "not-json{");
		expect(ws.data.streamId).toBe("");
	});

	it("captures streamId from `start` event (top-level streamId)", () => {
		const ws = freshWs();
		const raw = JSON.stringify({ event: "start", streamId: "stream-xyz" });
		// biome-ignore lint/suspicious/noExplicitAny: minimal ws stub
		handleVoiceStreamMessage(ws as any, raw);
		expect(ws.data.streamId).toBe("stream-xyz");
	});

	it("captures streamId from `start` event (nested start.streamSid)", () => {
		const ws = freshWs();
		const raw = JSON.stringify({
			event: "start",
			start: { streamSid: "stream-nested" },
		});
		// biome-ignore lint/suspicious/noExplicitAny: minimal ws stub
		handleVoiceStreamMessage(ws as any, raw);
		expect(ws.data.streamId).toBe("stream-nested");
	});

	it("forwards `media` payload through liveSession.sendAudio", () => {
		const ws = freshWs();
		const payload = Buffer.from([0x7f, 0x7f, 0x7f]).toString("base64");
		const raw = JSON.stringify({
			event: "media",
			media: { payload, contentType: "audio/x-mulaw", sampleRate: 8000 },
		});
		// biome-ignore lint/suspicious/noExplicitAny: minimal ws stub
		handleVoiceStreamMessage(ws as any, raw);
		// liveSession.sendAudio should have been called once with a Buffer.
		// biome-ignore lint/suspicious/noExplicitAny: stub typing
		const sendAudio = (ws.data.liveSession as any).sendAudio as ReturnType<
			typeof mock
		>;
		expect(sendAudio.mock.calls.length).toBe(1);
		const arg = sendAudio.mock.calls[0]?.[0];
		expect(Buffer.isBuffer(arg)).toBe(true);
		expect((arg as Buffer).length).toBe(3);
	});

	it("ignores `media` events when payload is empty", () => {
		const ws = freshWs();
		const raw = JSON.stringify({ event: "media", media: { payload: "" } });
		// biome-ignore lint/suspicious/noExplicitAny: minimal ws stub
		handleVoiceStreamMessage(ws as any, raw);
		// biome-ignore lint/suspicious/noExplicitAny: stub typing
		const sendAudio = (ws.data.liveSession as any).sendAudio as ReturnType<
			typeof mock
		>;
		expect(sendAudio.mock.calls.length).toBe(0);
	});

	it("ignores `media` when liveSession is null", () => {
		const ws = freshWs();
		ws.data.liveSession = null;
		const raw = JSON.stringify({
			event: "media",
			media: { payload: Buffer.from([0]).toString("base64") },
		});
		// Should not throw.
		// biome-ignore lint/suspicious/noExplicitAny: minimal ws stub
		handleVoiceStreamMessage(ws as any, raw);
		// nothing to assert beyond "did not throw"
		expect(true).toBe(true);
	});

	it("ignores unknown event types", () => {
		const ws = freshWs();
		// biome-ignore lint/suspicious/noExplicitAny: minimal ws stub
		handleVoiceStreamMessage(ws as any, JSON.stringify({ event: "wibble" }));
		expect(ws.data.streamId).toBe("");
	});
});
