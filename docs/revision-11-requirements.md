# Revision 11: Fishball-managed sessions and permission requests

**Status.** Agreed with the user in a requirements interview and approved on 2026-11-01, when the user asked for the build to start. [DESIGN.md](../DESIGN.md) is updated from this file. When a spike or the user later changes something, DESIGN.md records the amendment and its reason; this file stays as what was approved.

**Names.** Tool names here (`ask_fishball`, `list_user_messages`, `release_session`, `list_frozen_sessions`, `answer_prompt`, `stop_session`, `redirect_session`) are working names. The design may rename them.

## Problem

Today the `ApprovalBroker` in `src/approvals.js` (DESIGN §7a, decision Q-approval-routing "always") sends every permission request from every session to Fishball, and each one costs Fishball a step. That includes sessions the user never meant Fishball to look after, and requests that arrive when the user has given no allowance, which Fishball then escalates at once. Fishball's own requests (`add_plugin`, `remove_plugin`, unchecked tools) also freeze its turn on a DSH prompt.

## Behaviour

### A. Yours vs managed

1. Every session is either the user's or managed by Fishball. Connected and managed are the same thing.
2. A session becomes managed when:
   - Fishball starts it (`start_session`);
   - Fishball messages it (`message_session`);
   - Fishball answers a prompt frozen in it (item 20);
   - the user clicks **Hand over to Fishball** (session menu or header);
   - the user uses **Send to Fishball**.
3. A session that is the user's has no Fishball tools, and nothing in it mentions Fishball. Its prompts and questions stay in its own chat, Fishball is not told about them (they cost Fishball nothing), and it cannot start a conversation with Fishball.
4. Management ends when the user clicks **Take back from Fishball** (same spot) or Fishball calls `release_session`. The session then loses its Fishball tools and all its grants, and its prompts come to the user again.
5. Every hand-over, take-back and release wakes Fishball with a note.
30. **Managed-session marks** (added 2026-11-02; numbered after item 29). The user's request: "Add a new feature: whenever a session is managed by Fishball. above the input field with a "Managed by Fishball" message and a Fishball icon(or deepseek icon is using deepseek avatar) And a stop management button to cut its connection with fishball. And also show a fishball icon on its status light." The user's answers:
    - **Banner.** Above a managed session's input field: Fishball's icon (or DeepSeek's, when Fishball uses the DeepSeek icon), "Managed by Fishball", and a **Take back from Fishball** button. The button is the same action, with the same refusal dialog and wording, as the session menu, header and managed-sessions list.
    - **Status light.** Fishball's icon shows in the status light's place while the session is idle. While it runs, waits or has just finished, DSH's own light shows instead.
    - **Off.** While Session messages is off or Fishball isn't live, the whole banner is hidden.

### B. Asking Fishball (managed sessions)

6. `list_user_messages` returns the user's recent messages in that session, with IDs and short excerpts. (Agents cannot otherwise see message IDs.)
7. Before a call that needs approval, the agent calls `ask_fishball({tool, arguments, quote: [ids], why})`, with the exact arguments. Code adds the full text of each quoted message from the session's log, inside the untrusted framing of the request message to Fishball, and accepts only messages the user typed in that session (so a quote cannot be faked).
8. The agent stays frozen, like on a normal DSH prompt, until it gets a final answer. Fishball can:
   - **allow**: a one-time pass for exactly that call (same session, tool and arguments). Today's rules still apply: an allowance from the user in Fishball's own chat, low risk, a reason, and complete arguments;
   - **grant**: a standing grant (section D);
   - **reject**, with a reason that goes back to the agent;
   - **ask a question**: it goes back to the agent, which replies by calling `ask_fishball` again with the same request ID. The whole exchange stays one thread;
   - **send it to the user**: a card in the user's pile (section C).
9. Quoted messages only show what the user asked the session to do. They never count as an allowance.
10. If Fishball, or its Permission requests plugin, is off, `ask_fishball` is refused at once. The agent then makes the call and the user is prompted in that session.
11. If Fishball is on but does not answer within 120 s (the default, plugin config), the request moves to the user's pile and the agent keeps waiting.
12. A direct call that no pass or grant covers still goes to Fishball. It carries the user's last turn in that session, plus any reason the request already has. The agent's result then recommends `ask_fishball` next time, so it can explain why a call should be approved.
13. If the agent retries a call Fishball rejected, it goes back to Fishball like any other call.

### C. The user's pile

14. A stack pinned above Fishball's composer: "Waiting for you (n)". Each card shows the session, tool, exact arguments, quoted messages, the agent's reason, the discussion thread and Fishball's note, with **Allow once** / **Reject** and a details toggle.
15. The same buttons also appear in the session's own chat. Answering in either place clears both.
16. A session's card leaves when it is answered or when that session's turn ends or is stopped. A restart ends turns, so session cards do not survive one.

### D. Standing grants

17. Fishball may create a grant when the user's allowance in Fishball's chat covers it (prompt-only judgement). Calls a grant covers run without waking Fishball.
18. A grant is either an exact call that may repeat (same session, tool and arguments), or a command prefix. Prefix matching is on raw text, so `npm test*` also covers `npm test && git push`. The user accepted this risk after being warned.
19. A grant ends when:
    - it expires (an end time is required when it is created; no grant is open-ended);
    - the user revokes it (active grants are listed beside the pile, each with **Revoke**);
    - Fishball revokes it;
    - the session is taken back or released.

### E. Prompts already showing

20. Fishball is not told about prompts it was not sent. When the user asks, or when another session's message gives it a reason to look, it lists sessions frozen on a prompt (`list_frozen_sessions`: session, tool, exact arguments) and allows or rejects one (`answer_prompt`). The prompt closes, and that session becomes managed (Fishball is told).

### F. Fishball's own requests (`add_plugin`, `remove_plugin`, unchecked tools)

21. Fishball never freezes on a permission prompt. Its request becomes a card labelled Fishball in the pile, and the call returns "waiting for your approval" at once. Fishball keeps handling whatever else comes in.
22. **Allow** wakes Fishball with "approved, run it again", and a one-time pass covers the identical retry. **Reject**: Fishball is told.
23. Fishball can withdraw its own card when it no longer needs it.
24. Fishball's own cards survive a DSH restart.

### G. Questions (`ask_user_question`) in managed sessions

25. They go to Fishball. A mode in Fishball's settings menu decides who answers:
    - **Auto** (default): Fishball answers only when the user's own words cover it (in Fishball's chat, or a quoted user message); otherwise the question goes to the pile;
    - **Fishball**: Fishball answers from its own judgement and sends the user only what it cannot decide;
    - **User**: always the pile; Fishball may add a note.
26. Plan reviews (`exit_plan_mode`, the plan-review intent) follow the same mode. Question cards share the pile, and the user can also answer them in the session's own question card.
27. Every question Fishball answers (Auto or Fishball mode) gets a tag in the session's chat: "Asked Fishball" plus Fishball's answer.

### H. Stop and redirect (managed sessions)

28. `stop_session` ends the current turn, as the user's Stop button does. Its waiting requests and questions are cancelled, their cards leave the pile, and the session stays managed and idle until the next message from the user or Fishball. Fishball says so in its chat.
29. Fishball can steer a session gently or redirect it hard, and picks which per case:
    - steer: `message_session` lands at the session's next step;
    - redirect: `redirect_session` stops the turn and sends the instruction as a new turn.

## Non-goals

- No system notifications or sounds when a card lands in the pile. The pinned stack and its count are the only signal.
- No special rules for subagents. As today, DSH blocks their requests by default, and one that gets through counts as its parent session's.
- Fishball is not told about prompts in sessions that are the user's.
- No grants beyond exact-call and command-prefix (for example, no "any workspace-write bash call").
- Sessions never make contact with Fishball first.

## Accepted risks

- Raw-prefix grants match chained commands.
- Fishball can create grants that cover many calls, on prompt-only judgement.
- In Fishball mode, Fishball answers questions and approves plans on its own judgement.

## Changes to decisions already in DESIGN.md

- Q-approval-routing "always" now means only managed sessions.
- Q-exposure (`message_fishball` in every session) now means only managed sessions.
- §7a "Fishball cannot reject": it now can.
- §7a "one-time grants only": Fishball can now also create standing grants.
- §7a / N3: Fishball's own requests no longer use DSH's blocking prompt; they become non-blocking cards.
- §7a "`ask_user_question` always stays with the user": managed sessions' questions now go to Fishball.

## Defaults

Proposed with the spec and approved with it (the user made no corrections):

- **Pass lifetime:** a session's pass ends when used or when its turn ends. Fishball's retry pass ends when used, when withdrawn, or at the end of the turn it was woken for.
- **The user's Reject** takes an optional note, which goes to the agent.
- **Card cap:** cards are capped (`maxPendingApprovals`). Past the cap, requests show the normal prompt in their own session.
- **Restarts:** grants survive until they expire, and managed status survives too.
- **Prefix grants** apply to shell commands only. Other tools get exact-call grants only.
- **Fishball's rejects** need a reason.
- **Rejecting Fishball's own card** tells Fishball without waking it.
- **Leaving management:** a session's waiting `ask_fishball` returns "no longer managed". The agent then makes the call and the user is prompted there.
- **Question time limit:** Fishball also gets 120 s for questions. After that, the question moves to the pile.
- **Audit:** every Fishball decision (pass, grant, revoke, reject, question answer, prompt answer, stop, redirect) goes in the audit list, as approvals do today.

## Done when

Checked by hand in a real DSH:

1. A session the user starts shows no Fishball tools. Its prompts appear only there, and Fishball takes zero steps.
2. When Fishball messages that session, the tools appear and Fishball gets a "connected" note.
3. `ask_fishball` with a quote: Fishball sees the user's full message.
   - Allow: the call runs with no prompt.
   - Reject: the agent sees the reason.
   - Question: the agent replies in the same thread.
4. Three managed sessions waiting give three stacked cards. The user answers one in Fishball and one in its own session, and both clear.
5. A direct call in a managed session reaches Fishball with the user's last turn, and the agent sees the hint.
6. With an `npm test*` grant, five runs wake Fishball zero times. After the user revokes it, the next run goes to Fishball.
7. Fishball's `add_plugin`:
   - a card appears, and Fishball answers another message meanwhile;
   - Allow: Fishball retries, and the plugin gets installed;
   - a restart before the user clicks leaves the card in place.
8. A question in each of the three modes, with tags on the ones Fishball answered.
9. `stop_session` and `redirect_session` both work on a running session.
10. Taking a session back removes its tools and grants, and Fishball is told.

## Open

**Spikes** (numbered after S32 in DESIGN §13):

- **S33** (spec spike A): can Fishball close a prompt that is already showing in a session's browser? DSH's prompt closes itself when its request is cancelled, but Fishball would need to give the prompt a cancel signal of its own. Item 20 and answering in both places (item 15) depend on it.
- **S34** (spec spike B, plus stopping a turn): can tools be shown or hidden per session while it runs (managed vs the user's)? Can a plugin end a session's running turn as the Stop button does (item 28)?
- **S35** (spec spikes C and D): can the `ask_fishball` hint be added to the agent's result (item 12), given that DSH writes that text itself? Can Fishball's own requests return "waiting for your approval" at once (item 21), when DSH words any outcome other than allow as "the user rejected tool X"?
- **S36** (spec spike E): can Fishball answer `ask_user_question` and plan reviews in the same shape the browser does? Can the session's `ask_fishball` row show Allow once / Reject (item 15)? Can a question row show the "Asked Fishball" tag (item 27)?

**Still undecided** (ask the user before the phase that needs it):

- Whether permission requests Fishball answers should also get a tag in the session's chat. The gap shows most on direct calls (item 12), where nothing in the session shows that Fishball approved them.
- Where a managed session's question goes when Fishball is unavailable. Proposed, mirroring item 10: it stays in the session's own chat.
