import {
  buildComposerPayload,
  validateComposerPayload,
} from "./MessageComposer";

describe("MessageComposer helpers", () => {
  test("builds comment payload", () => {
    const payload = buildComposerPayload({
      scope: "comment",
      target: { depPublicKey: "abc" },
      text: "hello",
      songOption: null,
    });
    expect(payload.requestBody).toEqual({ dep_public_key: "abc", text: "hello", song_option: null });
    expect(payload.submitKind).toBe("text");
  });

  test("builds thread reply payload", () => {
    const payload = buildComposerPayload({
      scope: "thread_reply",
      target: { threadId: 10, username: "bob" },
      text: "",
      songOption: { title: "S", artists: ["A"] },
    });
    expect(payload.requestBody).toEqual({ text: "", song: { title: "S", artists: ["A"] } });
    expect(payload.submitKind).toBe("song");
  });

  test("builds thread start payload", () => {
    const payload = buildComposerPayload({
      scope: "thread_start",
      target: { targetUserId: 4, username: "bob" },
      text: " yo ",
      songOption: { title: "S", artists: ["A"] },
    });
    expect(payload.requestBody).toEqual({
      target_user_id: 4,
      text: "yo",
      song: { title: "S", artists: ["A"] },
    });
    expect(payload.submitKind).toBe("text+song");
  });

  test("rejects empty payload", () => {
    const validation = validateComposerPayload({
      text: "   ",
      songOption: null,
      allowText: true,
      allowSong: true,
      songRequired: false,
    });
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe("empty");
  });

  test("requires song when requested", () => {
    const validation = validateComposerPayload({
      text: "hello",
      songOption: null,
      allowText: true,
      allowSong: true,
      songRequired: true,
    });
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe("song_required");
  });
});
