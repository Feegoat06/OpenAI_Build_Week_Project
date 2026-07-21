# Tenutino V2 — Chatbot / AI Tutor Architecture

This document explains only Tenutino's Chatbot and AI Tutor system. Character movement, score-following animation, parkour, and dragging are outside its scope.

本文档只解释 Tenutino 的 Chatbot／AI Tutor 系统。角色移动、乐谱跟随动画、Parkour 和拖拽不属于本文范围。

---

## English

### 1. System overview

Tenutino's Chatbot is divided into five layers:

```text
Explain / Suggestions / Ask
            ↓
editor-view.js
Selects the transition and assembles musical context
            ↓
evidence.js
Computes deterministic musical facts
            ↓
api/coach.js
Calls GPT-5.6 on the server and validates its response
            ↓
tutor-chat.js
Renders the answer, persists history, and handles errors
```

The main files are:

- [`../js/ui/tutor-chat.js`](../js/ui/tutor-chat.js): drawer UI, modes, messages, loading, errors, retry, and local conversation history.
- [`../js/views/editor-view.js`](../js/views/editor-view.js): selects the relevant seam, builds the request, manages cancellation, and connects the UI to the coach.
- [`../js/coach/evidence.js`](../js/coach/evidence.js): calculates deterministic facts about a transition.
- [`../js/coach/prompts.js`](../js/coach/prompts.js): turns structured facts into the constrained tutor prompt.
- [`../js/coach/coach.js`](../js/coach/coach.js): browser-side request and response validation.
- [`../api/coach.js`](../api/coach.js): server-side OpenAI request, JSON Schema enforcement, and stable error responses.

The central rule is:

> Application code determines what happened musically. GPT explains those facts pedagogically instead of rediscovering or inventing them.

### 2. Chatbot modes

Tenutino exposes three conversational modes.

#### Explain this

`Explain this` immediately analyzes the relevant transition. The user does not need to type a question. The drawer opens, shows a loading state, and then renders the four-part educational response.

Its interface is labeled:

```text
Explanation
Understand the transition
```

#### Suggestions

`Suggestions` also sends an immediate request. It returns one concrete musical change followed by a short, evidence-grounded reason.

This mode currently returns text. It does not mutate the progression or create an executable edit.

#### Ask Tenutino

`Ask Tenutino` opens the drawer and focuses the text composer. It does not call GPT until the learner submits a question. Its reply is natural prose rather than a fixed educational card.

Enter submits the message; Shift+Enter creates a new line. Questions are limited to 600 characters.

### 3. Selecting the musical context

The Chatbot explains one `seam` at a time. A seam is the transition between two adjacent chords:

```text
departing chord → seam → arriving chord
```

The editor resolves the seam from the latest meaningful context:

1. Use the most recently edited seam when available.
2. If a chord was edited, use an adjacent seam.
3. Otherwise use the currently selected seam.
4. If fewer than two chords exist, do not call GPT.

When there is no valid seam, Tenutino responds locally:

> Add one more chord and I can look at the connection with you.

The drawer also shows a concise label such as:

```text
C Major → F Major · Secondary dominant
```

This label is for orientation only. The model receives exact MIDI voicings and compiled evidence.

### 4. Request payload

For a valid seam, `editor-view.js` constructs this payload:

```js
{
  fromChord: { name, notes },
  toChord: { name, notes },
  technique,
  generatedNotes,
  evidence,
  location,
  mode,
  question,
  history
}
```

#### Chords

`fromChord.notes` and `toChord.notes` are the exact MIDI notes stored in progression state. They are the notes that notation and audio consume; they are not reconstructed by GPT.

#### Technique

When a transition technique is selected, the payload includes its registry ID, display name, and beat cost. With no selected technique, the payload contains `none`, and the prompt identifies the connection as direct.

#### Generated notes

Generated notes come from the actual `compile()` output for the selected seam. This means GPT sees the final voice-led technique material that the learner hears, not merely an abstract technique name.

#### Score location

`location` identifies the focused measure and the measures occupied by the departing chord, generated transition, and arriving chord. Internal `measureIndex` values are zero-based, while `focusMeasureNumber` and all measure-number arrays are one-based to match the score labels a pianist sees. The prompt treats this location as authoritative and forbids inventing another measure.

Explain and Suggestions use their structured formats only for the initial one-click response. If the learner types any follow-up in the composer, the drawer switches to Ask mode and requests a natural, unstructured conversational answer while preserving the earlier response in the conversation.

#### Mode and question

`mode` is `explain`, `suggest`, or `ask`. The learner question is truncated to 600 characters and is explicitly labeled as content to answer, never as higher-priority instructions.

### 5. Deterministic evidence

`buildCoachEvidence()` computes:

```js
{
  commonPitchClasses,
  exactCommonMidiNotes,
  bassMotionSemitones,
  sopranoMotionSemitones,
  generatedEvents,
  generatedTotalBeats
}
```

- `commonPitchClasses`: pitch classes present in both chords, regardless of octave.
- `exactCommonMidiNotes`: exact MIDI pitches present in both voicings.
- `bassMotionSemitones`: arriving bass minus departing bass.
- `sopranoMotionSemitones`: arriving highest note minus departing highest note.
- `generatedEvents`: generated notes and durations from compiled technique segments.
- `generatedTotalBeats`: total duration of generated transition material.

This separation lets the application make factual claims while GPT concentrates on explanation, listening guidance, and reflection.

### 6. Prompt contract and theory guardrails

The prompt defines Tenutino as a warm, concise tutor for an intermediate-to-advanced pianist.

It instructs GPT to:

- Use only supplied chord, voicing, generated-note, rhythm, transition, and evidence data.
- Never invent notes, extensions, keys, tonal centers, functional labels, or voice-leading details.
- Treat the displayed key signature as spelling information, not proof of tonal center.
- State limitations plainly when the evidence is insufficient.
- Describe direct transitions as direct instead of inventing a technique.
- Mention common tones, semitone resolution, bass motion, soprano motion, or parsimonious motion only when the evidence supports the claim.

The prompt includes recent conversation, but the theory guardrails remain the governing instructions. User text is JSON-encoded inside the prompt and labeled as untrusted learner content.

### 7. Mode-specific response shapes

Explain mode uses strict JSON with five non-empty strings, including a type discriminator:

```json
{
  "type": "explanation",
  "whatYouHear": "...",
  "whyItWorks": "...",
  "tryThis": "...",
  "reflect": "..."
}
```

- `whatYouHear`: one or two sentences about the likely perceived effect, distinguishing interpretation from fact.
- `whyItWorks`: two to four sentences explaining supported harmonic, melodic, rhythmic, or voice-leading evidence.
- `tryThis`: one actionable listening or playing experiment. In Suggest mode, it should be a concrete alternative.
- `reflect`: one short comparison, prediction, or evaluation question.

Suggestions uses a smaller strict structure:

```json
{
  "type": "suggestion",
  "suggestion": "One concrete musical change",
  "reason": "A brief explanation grounded in the supplied notes"
}
```

Ask mode requests natural plain text without JSON or fixed headings. The server wraps that text as `{ type: "answer", answer: "..." }` only for safe transport and client validation. Explain and Ask responses stay under 180 words; Suggestions stays under 100 words. All modes avoid generic praise and retain the same theory guardrails.

### 8. Server request and validation

The browser sends:

```text
POST /api/coach.js
Content-Type: application/json
```

The server:

1. Verifies that `OPENAI_API_KEY` exists.
2. Builds the constrained prompt.
3. Calls the OpenAI Responses API.
4. Uses `OPENAI_MODEL` or defaults to `gpt-5.6`.
5. Limits output to 700 tokens.
6. Selects the response contract from `mode`: strict JSON Schema for Explain and Suggestions, plain text for Ask.
7. Extracts and parses the returned text.
8. Applies a second application-level shape check.
9. Returns `{ mode, reply }` to the browser.

The API key remains server-side and never appears in client configuration.

Both server and client validate the selected mode and its response envelope. Missing fields, empty strings, malformed structured JSON, additional structured fields, or a mode mismatch are rejected rather than partially rendered.

### 9. Rendering and conversation memory

Explain responses render as four labeled sections:

```text
WHAT YOU HEAR
WHY IT WORKS
TRY THIS
REFLECT
```

Suggestions renders only `TRY THIS` and `WHY`. Ask renders one natural answer bubble and preserves line breaks without imposing section labels.

All user and model content is HTML-escaped before insertion into the page.

Conversation history is stored per project under:

```text
legato:tutor-chat:<projectId>
```

The drawer keeps at most 40 valid messages. An entry may contain a user string, a legacy assistant string, or a validated explanation, suggestion, or answer object. Invalid stored entries are discarded when history is restored.

The editor supplies up to the latest ten entries to the prompt builder; the prompt builder retains the latest eight. Only `role` and `content` are sent to the model.

### 10. Loading, cancellation, timeout, and retry

While waiting, the drawer displays:

> Tracing the exact voices and generated notes...

Only one coach request is considered current. Starting a new request aborts the previous one, preventing an older answer from overwriting a newer conversation.

Each request has a 20-second timeout. Failures produce controlled UI states for:

- Missing server configuration.
- Provider errors.
- Timeouts.
- Empty responses.
- Malformed JSON.
- Schema-invalid responses.

The Retry button preserves the seam index, mode, and learner question so it repeats the same educational request.

### 11. Playback relationship

When full-progression playback starts, the Tutor drawer closes and its edge opener is hidden. It returns after playback stops. This prevents the Chatbot from obscuring the score or competing with Tenutino's playback-following state.

### 12. Current boundaries

The Chatbot currently:

- Explains one local seam rather than the full composition.
- Returns textual suggestions rather than executable edits.
- Waits for the complete response instead of streaming tokens.
- Computes only selected evidence such as common tones and outer-voice movement, not full inner-voice matching.

In one sentence:

> Tenutino's Chatbot is a local transition tutor in which deterministic code establishes musical truth, GPT-5.6 turns that truth into teaching, and strict client/server contracts keep the result safe and renderable.

---

## 中文

### 1. 系统概览

Tenutino Chatbot 被拆分为五层：

```text
Explain / Suggestions / Ask
            ↓
editor-view.js
选择需要解释的 transition，组装音乐上下文
            ↓
evidence.js
计算确定性的音乐事实
            ↓
api/coach.js
在服务器端调用 GPT-5.6，并验证返回结果
            ↓
tutor-chat.js
显示回答、保存历史、处理错误与重试
```

主要文件：

- [`../js/ui/tutor-chat.js`](../js/ui/tutor-chat.js)：聊天抽屉、模式、消息、Loading、错误、重试和本地聊天历史。
- [`../js/views/editor-view.js`](../js/views/editor-view.js)：选择相关 seam、构建请求、管理取消逻辑，并连接 UI 与 Coach。
- [`../js/coach/evidence.js`](../js/coach/evidence.js)：计算 transition 的确定性音乐事实。
- [`../js/coach/prompts.js`](../js/coach/prompts.js)：把结构化事实转换成受限制的 Tutor Prompt。
- [`../js/coach/coach.js`](../js/coach/coach.js)：浏览器端请求与响应验证。
- [`../api/coach.js`](../api/coach.js)：服务器端 OpenAI 请求、JSON Schema 限制和稳定的错误响应。

核心原则：

> 应用代码负责判断音乐上实际发生了什么，GPT 只负责把这些事实转化成教学语言，而不是重新猜测或虚构事实。

### 2. Chatbot 的三个模式

#### Explain this

`Explain this` 会立即分析当前相关的 transition。用户不需要输入问题。聊天抽屉打开后先显示 Loading，然后渲染四段式教学回答。

界面标题为：

```text
Explanation
Understand the transition
```

#### Suggestions

`Suggestions` 也会立即发送请求。它会返回一个具体的音乐修改建议，以及一段基于现有音符证据的简短原因。

当前 Suggestions 只返回文字，不会修改 progression，也不会自动创建可执行编辑。

#### Ask Tenutino

`Ask Tenutino` 只打开聊天抽屉并聚焦输入框，不会立刻调用 GPT。用户提交问题后才会发送请求。回答使用自然文本，不强制显示为固定的教学卡片。

Enter 发送消息，Shift+Enter 换行。问题最多 600 个字符。

### 3. 如何选择音乐上下文

Chatbot 每次只解释一个 `seam`。Seam 表示两个相邻和弦之间的连接：

```text
离开和弦 → seam → 到达和弦
```

编辑器根据最近的有效上下文决定 seam：

1. 如果最近编辑的是 seam，使用该 seam。
2. 如果最近编辑的是和弦，使用它旁边的 seam。
3. 否则使用当前选中的 seam。
4. 如果不足两个和弦，则不调用 GPT。

没有有效 seam 时，Tenutino 会直接显示本地消息：

> Add one more chord and I can look at the connection with you.

聊天抽屉顶部还会显示简短上下文，例如：

```text
C Major → F Major · Secondary dominant
```

这个标签只帮助用户确认讨论位置。模型真正收到的是精确 MIDI voicing 和编译后的音乐证据。

### 4. 请求数据

找到有效 seam 后，`editor-view.js` 构建：

```js
{
  fromChord: { name, notes },
  toChord: { name, notes },
  technique,
  generatedNotes,
  evidence,
  location,
  mode,
  question,
  history
}
```

#### 和弦

`fromChord.notes` 和 `toChord.notes` 是 progression 中保存的精确 MIDI 音，也是记谱与播放真正使用的数据，不由 GPT 重新构造。

#### Technique

如果选择了 transition technique，请求中包含 registry ID、显示名称和 beat cost。没有 technique 时发送 `none`，Prompt 会明确将它描述为 direct transition。

#### Generated notes

Generated notes 直接来自该 seam 的 `compile()` 输出。因此 GPT 看到的是用户真正听到的、已经完成 voice-leading 的生成材料，而不是抽象的 technique 名称。

#### 乐谱位置

`location` 会指出当前聚焦的小节，以及离开和弦、生成过渡和到达和弦分别占据哪些小节。内部 `measureIndex` 从 0 开始，而 `focusMeasureNumber` 和所有小节编号数组从 1 开始，与演奏者在乐谱上看到的编号一致。Prompt 会把这些位置视为确定事实，并禁止虚构其他小节位置。

“Explain this”和“Suggestions”的结构化格式只用于点击按钮后产生的第一条回答。只要学习者在输入框中手动输入并发送后续问题，聊天框就会切换到 Ask 模式，并请求自然、无固定结构的对话式回答；先前的结构化回答仍会保留在对话记录中。

#### Mode 与问题

`mode` 为 `explain`、`suggest` 或 `ask`。用户问题会被截断到 600 字符，并明确标记为需要回答的内容，而不是可以覆盖系统限制的高优先级指令。

### 5. 确定性音乐证据

`buildCoachEvidence()` 计算：

```js
{
  commonPitchClasses,
  exactCommonMidiNotes,
  bassMotionSemitones,
  sopranoMotionSemitones,
  generatedEvents,
  generatedTotalBeats
}
```

- `commonPitchClasses`：两个和弦共有的音级，不考虑八度。
- `exactCommonMidiNotes`：两个 voicing 中完全相同的 MIDI 音高。
- `bassMotionSemitones`：到达低音减去离开低音。
- `sopranoMotionSemitones`：到达最高音减去离开最高音。
- `generatedEvents`：编译后 technique segment 的生成音与时值。
- `generatedTotalBeats`：所有生成过渡材料的总时长。

这种分工让应用代码负责事实，GPT 专注于解释、听觉引导和反思问题。

### 6. Prompt 契约与理论限制

Prompt 把 Tenutino 定义为面向中高级钢琴学习者、温暖而简洁的 AI 音乐导师。

GPT 被要求：

- 只使用提供的 chord、voicing、generated notes、rhythm、transition 和 evidence。
- 不虚构音符、extension、调性、调性中心、功能和声标签或声部进行。
- 把 key signature 视为记谱拼写信息，而不是调性中心的证明。
- 数据不足时明确说明限制。
- 没有 technique 时明确称为 direct transition。
- 只有证据支持时，才能讨论共同音、半音解决、Bass motion、Soprano motion 或 parsimonious motion。

Prompt 会包含最近对话，但理论限制仍然是主导指令。用户输入会先转换成 JSON 字符串，并被标记为不可信的 learner content。

### 7. 不同模式的响应结构

Explain 模式使用严格 JSON，其中包含类型标记和四个教学字段：

```json
{
  "type": "explanation",
  "whatYouHear": "...",
  "whyItWorks": "...",
  "tryThis": "...",
  "reflect": "..."
}
```

- `whatYouHear`：用一到两句话描述可能听到的效果，并区分主观解释与客观事实。
- `whyItWorks`：用两到四句话解释证据支持的和声、旋律、节奏或声部进行。
- `tryThis`：提供一个可执行的聆听或演奏实验。在 Suggest 模式中应给出具体替代方向。
- `reflect`：提出一个简短的比较、预测或评价问题。

Suggestions 使用更简洁的严格结构：

```json
{
  "type": "suggestion",
  "suggestion": "一个具体的音乐修改建议",
  "reason": "根据现有音符给出的简短解释"
}
```

Ask 模式要求模型直接返回自然文本，不使用 JSON，也不强制套用固定标题。服务器只会为了安全传输和客户端验证，把文本包装成 `{ type: "answer", answer: "..." }`。Explain 和 Ask 控制在 180 个英文单词以内，Suggestions 控制在 100 个英文单词以内。三个模式继续共享相同的乐理限制。

### 8. 服务器请求与验证

浏览器发送：

```text
POST /api/coach.js
Content-Type: application/json
```

服务器执行：

1. 检查 `OPENAI_API_KEY` 是否存在。
2. 构建受限制的 Prompt。
3. 调用 OpenAI Responses API。
4. 使用 `OPENAI_MODEL`，未配置时默认 `gpt-5.6`。
5. 将最大输出限制为 700 tokens。
6. 根据 `mode` 选择响应契约：Explain 和 Suggestions 使用 strict JSON Schema，Ask 使用自然文本。
7. 提取并解析模型文本。
8. 再执行一次应用层结构验证。
9. 向浏览器返回 `{ mode, reply }`。

API Key 始终保留在服务器端，不会进入浏览器配置。

服务器和客户端都会验证当前模式及其响应包装。字段缺失、空字符串、结构化 JSON 非法、出现额外结构化字段或模式不匹配时，响应都会被拒绝，而不是部分渲染。

### 9. 渲染与对话记忆

Explain 响应会显示为四个区块：

```text
WHAT YOU HEAR
WHY IT WORKS
TRY THIS
REFLECT
```

Suggestions 只显示 `TRY THIS` 和 `WHY`。Ask 显示为一个自然回答气泡，保留换行，但不强制加入区块标题。

所有用户内容和模型内容在进入 DOM 前都会进行 HTML escaping。

对话历史按项目保存：

```text
legato:tutor-chat:<projectId>
```

聊天抽屉最多保存 40 条有效消息。一条记录可以是用户字符串、旧版 Assistant 字符串，或者经过验证的 explanation、suggestion 或 answer 对象。恢复历史时会丢弃非法记录。

编辑器最多把最近 10 条历史交给 Prompt Builder，Prompt Builder 最终保留最近 8 条。发送给模型的历史只包含 `role` 和 `content`。

### 10. Loading、取消、超时与重试

等待期间显示：

> Tracing the exact voices and generated notes...

系统只承认一个最新 Coach 请求。新请求会取消旧请求，避免较早的回答覆盖较新的对话。

每个请求的超时时间为 20 秒。以下情况会显示受控错误状态：

- 服务器没有配置 API Key。
- OpenAI 服务错误。
- 请求超时。
- 模型返回空内容。
- JSON 无法解析。
- 响应不符合 Schema。

Retry 会保留原来的 seam index、mode 和 learner question，因此会重试同一项教学请求。

### 11. 与播放系统的关系

整首 progression 开始播放时，Tutor drawer 会关闭，右侧打开入口也会隐藏。播放停止后入口重新出现。这可以避免 Chatbot 遮挡乐谱，或者与 Tenutino 的播放跟随状态发生冲突。

### 12. 当前边界

当前 Chatbot：

- 每次只解释一个局部 seam，而不是整首作品。
- Suggestions 仍然是文字，不是可直接执行的编辑。
- 不使用流式输出，需要等待完整响应。
- 只计算共同音和外声部运动等选定证据，没有完整的内声部配对。

一句话总结：

> Tenutino Chatbot 是一个局部 transition 导师：确定性代码负责建立音乐事实，GPT-5.6 负责把事实转化为教学，而严格的客户端与服务器契约保证结果安全、可靠且可以稳定渲染。

