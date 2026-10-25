# STT / ASR provider research for the TypeScript voice engine

Research date: 2026-10-22. Method: WebSearch plus WebFetch against official docs and pricing pages where they were reachable. Where an official page could not be read, the entry says so and the figure comes from a secondary source. Several official pages are undated, and some third-party figures conflict. Treat every price as "verify before budgeting".

Conventions:
- "$/hr" is USD per audio hour, list price, before discounts and taxes.
- "Verified" means read from an official page in this session. "Secondary" means a third-party or competitor page. "Unverified" means from general knowledge or not confirmed.
- Env var names are the conventional names used by each vendor's SDK. They are not guaranteed.

---

## 1. Provider entries

### 1.1 Deepgram (Nova-3, Flux)

- Base URL: `https://api.deepgram.com`
- Batch (prerecorded): `POST https://api.deepgram.com/v1/listen` with `?model=nova-3` (also `model=whisper-*`, `nova-2`). Verified.
- Streaming (Nova-3 / legacy): `wss://api.deepgram.com/v1/listen` (unverified in this session, standard Deepgram endpoint).
- Flux (turn-detection streaming): `wss://api.deepgram.com/v2/listen`. Verified. `/v1/listen` does not work with Flux. Plain `model=flux` is invalid; use `flux-general-en` or `flux-general-multi`.
- Auth: `Authorization: Token <API_KEY>`. Verified.
- Env var: `DEEPGRAM_API_KEY`.
- Models (current best): `nova-3` (monolingual and `multi`), `flux-general-en`, `flux-general-multi`, `nova-2`, `whisper-*` (Whisper Large via Deepgram). Language counts are approximate tallies of the codes on the models page: Nova-3 general about 105 codes including variants; Flux multi covers 10 languages; Nova-2 general about 54.
- Features: word timestamps, diarization, language detection (`multi`), keyterm prompting, redaction, interim results. Flux adds turn events `EndOfTurn`, `EagerEndOfTurn`, `TurnResumed`, configurable `eot_threshold` (0.5 to 1.0, default 0.7), `eager_eot_threshold` (0.3 to 0.9), `eot_timeout_ms`. Eager EOT can raise LLM calls by 50 to 70 percent. Verified.
- Audio: raw `linear16`, `linear32`, `mulaw`, `alaw`, `opus`, `ogg-opus` (need `encoding` and `sample_rate`; 8k, 16k, 24k, 44.1k, 48k). Containers WAV (linear16) and Ogg/WebM (opus) need no encoding params. Recommended: 16 kHz linear16, 80 ms chunks (2560 bytes). Verified.
- Size and duration limits: not captured in this session. Unverified.
- Pricing (deepgram.com/pricing, undated; streaming rates marked "limited-time promotional", no end date):
  - Streaming PAYG per hour: Nova-3 mono $0.29; Nova-3 multi $0.35; Flux EN $0.39; Flux multi $0.47. Growth plan: $0.25, $0.30, $0.34, $0.41.
  - Pre-recorded PAYG per hour: Nova-3 mono $0.26; Nova-3 multi $0.31; Whisper Large $0.29. Growth: $0.22, $0.26, $0.29.
  - Add-ons: streaming diarization +$0.12/hr (PAYG); pre-recorded diarization included; keyterm +$0.08/hr; redaction +$0.12/hr.
  - Secondary sources give higher "regular" (non-promo) streaming rates, for example Flux EN $0.0077/min. Confirm the live price.
- Latency class: streaming, low. Vendor-positioned for voice agents. Latency numbers not verified here.
- Accuracy reputation: strong English, very popular in voice agents. Multilingual quality is generally a step behind Scribe v2 and gpt-transcribe in reputation. Not benchmarked here.
- OpenAI-compatible: no.

### 1.2 ElevenLabs Scribe (v2, v2 Realtime)

- Base URL: `https://api.elevenlabs.io`. Regional hosts exist (US, EU, India, Singapore). Verified.
- Batch: `POST https://api.elevenlabs.io/v1/speech-to-text` (multipart/form-data). Verified.
- Realtime WebSocket: the URL was not captured in this session. Unverified guess: `wss://api.elevenlabs.io/v1/speech-to-text/realtime`. The docs point to `https://elevenlabs.io/docs/llms.txt` for the full index.
- Auth: header `xi-api-key: <KEY>`. For browser clients, a single-use `token` query param from `POST /v1/single-use-token/batch_scribe` (15 min TTL). Verified.
- Env var: `ELEVENLABS_API_KEY`.
- Models: `model_id=scribe_v2` (examples). `scribe_v2_realtime` for streaming (unverified ID). `no_verbatim` only with `scribe_v2`. `scribe_v1` is not on the fetched page.
- Languages: 90+ (Scribe v2 and v2 Realtime). Verified.
- Features: word timestamps (`timestamps_granularity=word|character`), diarization (up to 32 speakers, `diarize`, `num_speakers`), multichannel (`use_multi_channel`, up to 5 channels), language auto-detect with `language_code` and `language_probability`, keyterms (up to 1000 per request, under 50 chars, at most 5 words each; +20% surcharge), entity detection (65 types, realtime), transcript editing (experimental, extra cost), `detect_speaker_roles` (agent/customer, +10%), raw PCM input (`file_format=pcm_s16le_16`). Verified except the realtime-specific items.
- Size and duration: upload under 5.0 GB, minimum 100 ms. Max duration not stated. `source_url` accepts hosted audio/video, YouTube, TikTok. Verified.
- Pricing (official page, undated; prices exclude tax):
  - Scribe v2 batch: $0.22/hr. Keyterm +$0.05/hr; transcript editing +$0.07/hr.
  - Scribe v2 Realtime: $0.39/hr. Keyterm +$0.08/hr; editing +$0.12/hr.
  - Secondary aggregators cite $0.27/hr for batch. This conflicts with the official $0.22, so use the official page.
- Latency class: realtime claimed about 150 ms (vendor). Batch is not latency-focused.
- Accuracy reputation: "over 98%" claimed for Scribe v2 (vendor). Widely regarded as a top multilingual option.
- OpenAI-compatible: no.

### 1.3 OpenAI (whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe, realtime)

Important 2026 change: the current docs recommend `gpt-transcribe` and `gpt-live-transcribe`. The older models are deprecated and shut down on **2027-02-26**.

- Base URL: `https://api.openai.com/v1`.
- Batch: `POST https://api.openai.com/v1/audio/transcriptions` (multipart). Verified.
- Translation (deprecated): `POST /v1/audio/translations` (uses whisper-1, English output only). Migration target: `/v1/realtime/translations` with `gpt-realtime-translate`. Verified.
- Realtime transcription: session route `POST /v1/realtime/transcription_sessions`. Verified as a route. The WebSocket URL was not captured. Unverified guess: `wss://api.openai.com/v1/realtime?intent=transcription`.
- Auth: `Authorization: Bearer <KEY>`. Env var: `OPENAI_API_KEY`.
- Models:
  - `gpt-transcribe`: recommended batch model, streaming supported (`stream=true`). Verified.
  - `gpt-live-transcribe`: recommended realtime model. Verified.
  - `whisper-1`: deprecated (2027-02-26). Only model with word timestamps via `verbose_json` + `timestamp_granularities[]`. Covers 98 languages. Verified.
  - `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize`: deprecated (2027-02-26). Diarization model returns `diarized_json`, not realtime.
- Languages: `gpt-transcribe` takes `languages` (ISO 639-1, selected 639-3, `zh-cn` style), with a list of language hints; responses report detected languages. Exact count not stated.
- Features: streaming events `transcript.text.delta`, `transcript.text.done`, `transcript.text.segment` (diarized only). `prompt` and `keywords` are supported on `gpt-transcribe` (keywords cannot contain `< > CR LF`). Word timestamps are documented only on whisper-1. Confidence: not documented.
- Audio: mp3, mp4, mpeg, mpga, m4a, wav, webm. Max file 25 MB; split or compress larger files. Duration limit not stated. Verified.
- Pricing (verified from model pages, 2026 docs):
  - `gpt-transcribe`: $0.0045/min = **$0.27/hr**.
  - `gpt-live-transcribe` (realtime): $0.017/min = **$1.02/hr**.
  - Older token pricing (still on older docs): gpt-4o-transcribe $2.50/M input, $10/M output; gpt-4o-mini-transcribe $1.25/M input, $5/M output. Source: OpenAI model pages; the OpenAI pricing page itself returned 403. Date of these older figures is unknown.
  - whisper-1 per-minute price was not captured. Historical public figure: $0.006/min ($0.36/hr). Unverified for 2026.
- Latency class: `gpt-live-transcribe` for streaming; batch otherwise.
- Accuracy reputation: strong multilingual; widely considered comparable to top commercial ASR. Not benchmarked here.
- OpenAI-compatible: this is the reference shape. Path `/v1/audio/transcriptions` is what compatible servers implement. Note that the model IDs above are new and may not exist on other OpenAI-compatible hosts.

### 1.4 AssemblyAI (Universal-3.x, Universal-2, Universal-Streaming; "Slam" is retired)

- Base URL: `https://api.assemblyai.com`. Batch uses `/v2/`: `POST /v2/upload`, `POST /v2/transcript`, `GET /v2/transcript/{id}`. Verified.
- Streaming: `wss://streaming.assemblyai.com/v3/ws`. Verified. The v2 streaming endpoint is inactive.
- Auth: header `authorization: <API_KEY>` (no `Bearer`). Browser clients use a short-lived temporary token (format not captured). Verified.
- Env var: `ASSEMBLYAI_API_KEY`.
- Models (pricing reference, last updated 2026-09-28):
  - Async: `universal-3-5-pro` $0.21/hr; `universal-2` $0.15/hr; `slam-1` deprecated, migrate to `universal-3-5-pro`. Legacy `best` and `nano` alias to 3.5 Pro and Universal-2.
  - Streaming: `universal-3-6-pro` (Universal-3.6 Pro Realtime) $0.45/hr; `universal-streaming-english` $0.15/hr; `universal-streaming-multilingual` $0.15/hr.
  - The page has an internal naming conflict: one section says "Universal-3.5 Pro Realtime" where the table says 3.6. Older IDs `u3-rt-pro` and `u3-pro` are referenced but not listed.
  - "Universal-3 Slam" does not exist as a current product. Slam-1 is deprecated.
- Add-ons (per hour): diarization +$0.02 async, +$0.065 experimental async, +$0.12 streaming; keyterms +$0.05 async (Universal-3.5 Pro, Universal-2), +$0.04 Universal-Streaming English, included on 3.6 Pro Realtime and Universal-Streaming Multilingual; medical mode +$0.15; translation +$0.06; language detection listed as a feature, not priced on the page; entity detection +$0.08; PII audio redaction +$0.05; PII text redaction +$0.08.
- Features: word timestamps (ms), per-word confidence, speaker labels, language detection (`language_detection: true`, returns `language_code`), turn events (`Turn`, `end_of_turn`, `end_of_turn_confidence`, `turn_is_formatted`), `Terminate` message. Verified.
- Audio: async up to 5 GB per request (`/v2/transcript`), local uploads up to 2.2 GB via `/v2/upload`, duration 160 ms to 10 h. Formats: "most common audio and video formats", no full list. Streaming: default mono 16-bit PCM with `sample_rate`; AAC (ADTS), `ogg_opus`, `opus` supported. Verified.
- Streaming billing: by session connection time, not audio sent. Sessions auto-close after 3 h and bill for the full time. Verified.
- Languages: count not stated on the fetched pages. Multilingual streaming covers the languages listed by the vendor. Unverified exact count.
- Latency class: streaming, low.
- Accuracy reputation: Universal line is well regarded for English and recognized as strong across languages. Not benchmarked here.
- OpenAI-compatible: no.

### 1.5 Groq (Whisper Large v3 / Turbo)

- Base URL: `https://api.groq.com/openai/v1`. Verified.
- Batch: `POST https://api.groq.com/openai/v1/audio/transcriptions`; translation at `/audio/translations` (English output only). Verified.
- Streaming: none (batch only). Verified by absence.
- Auth: `Authorization: Bearer <KEY>`. Env var: `GROQ_API_KEY`.
- Models: `whisper-large-v3-turbo` (price-performance pick, no translation) and `whisper-large-v3` (translation supported, more accurate per Groq's WER table: 10.3% vs 12%). Groq-reported WER, not independent.
- Languages: multilingual (turbo listed as 99+ on the model page). Verified.
- Features: `response_format` json, verbose_json, text; `timestamp_granularities` segment or word (needs verbose_json); language ISO-639-1; temperature; prompt up to 224 tokens. Diarization: no. Confidence: not listed. Verified.
- Audio: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm. Max 25 MB (free) or 100 MB (dev tier); use the `url` parameter for larger files. Minimum file 0.01 s, minimum billed 10 s per request. Verified.
- Pricing (verified on model page, undated): turbo **$0.04/hr**; large-v3 **$0.111/hr**. Pricing page is `groq.com/pricing`. Note the 10 s billing minimum.
- Latency class: very fast batch (speed factor reported around 216x for turbo, Groq-reported).
- Accuracy reputation: good for the Whisper family, not top-tier multilingual versus gpt-transcribe or Scribe.
- OpenAI-compatible: yes, exact.

### 1.6 Gladia (Solaria)

- Base URL: `https://api.gladia.io`. Verified.
- Realtime: `POST https://api.gladia.io/v2/live` (optional `region=us-west|eu-west`). Returns `id`, `created_at`, and `url` (`wss://api.gladia.io/v2/live?token=...`). Status: `GET /v2/live/:id`. Verified.
- Auth: header `x-gladia-key`. Env var: `GLADIA_API_KEY`. Verified.
- Models: `solaria-1` is the default on the live docs. A Gladia blog post says Solaria-3 has been released. The live API doc does not list it. Conflict; verify before use.
- Audio: `wav/pcm` (default), `wav/alaw`, `wav/ulaw`; bit depth 8/16/24/32; sample rates 8k, 16k (default), 32k, 44.1k, 48k; 1 to 8 channels. Verified.
- Languages: 99 codes for transcription; translation targets 100. Verified.
- Features (realtime): translation (`translation`, `target_languages`), custom vocabulary, custom spelling, named entity recognition, sentiment (each off by default), endpointing (default 0.05 s), `maximum_duration_without_endpointing` (5 to 60 s). Word timestamps and diarization were not confirmed on the fetched page; both appear in the wider product, so verify.
- Pricing: unverified. Secondary and vendor-marketing sources cite a $0.20/hr "Growth floor", commitment-dependent. Some third parties call it usage-based. Treat as unknown until the pricing page is read.
- Latency class: streaming; vendor claims partial transcripts under 103 ms and final around 300 ms.
- Accuracy reputation: vendor-positioned; not benchmarked here.
- OpenAI-compatible: no.

### 1.7 Speechmatics

- Base URLs (unverified, standard): realtime `wss://eu2.rt.speechmatics.com/v2` (region-specific), batch `https://asr.api.speechmatics.com/v2/jobs`. The quickstart fetch did not confirm these.
- Auth: API key or JWT; examples use `api_key` or a generated JWT. `Authorization: Bearer` not shown on the fetched pages. Env var: `SPEECHMATICS_API_KEY` (convention).
- Models ("operating points" and product names): Enhanced (`enhanced`, highest accuracy, one language per job), Standard, plus product models Melia 1 (multilingual, 56 languages per page), Oak 1 (clinical), Linden 1 (realtime, voice agents). Verified from pricing page.
- Features: partials (`enable_partials`), diarization, speaker identification, custom dictionary, turn detection, `max_delay` latency control. Translation not on fetched pages. Verified.
- Audio: raw PCM_S16LE; 16 kHz and 44.1 kHz examples. Other formats via audio docs page (not fetched).
- Pricing per hour (list, verified on pricing page, USD): Standard $0.45 batch / $0.45 realtime; Enhanced $0.75 / $0.80; Melia 1 $0.24 batch / $0.40 realtime (with opt-in model-training discount: $0.16 / $0.27); Oak 1 $0.30 batch (realtime $0.75 shown in one section only, may be inconsistent); Linden 1 $0.30 realtime. Free tier: $100 credits, no card. Enterprise is quote-based.
- Latency class: configurable via `max_delay`.
- Accuracy reputation: Enhanced is a strong pick. Languages per product vary.
- OpenAI-compatible: no.

### 1.8 Azure Speech (Azure AI Speech)

- Endpoint families (from general knowledge, not confirmed in this session's fetch): realtime WebSocket `wss://{region}.stt.speech.microsoft.com/...`; REST short audio; Fast transcription REST; Batch transcription REST v3.2+.
- Auth: `Ocp-Apim-Subscription-Key: <KEY>` or `Authorization: Bearer <token>`. Env vars (convention): `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`.
- Models (verified from the Learn overview, updated 2026-10-02): **Azure LLM Speech** (flagship for fast transcription; LLM-based, prompting and translation), **Azure Transcribe** (general, default when enhanced is off; diarization, phrase lists, language ID, timestamps), **MAI-Transcribe-2** and **MAI-Transcribe-1.5** (Microsoft in-house; MAI-Transcribe-2 promo "till 12/31/2026").
- Features: real-time with intermediate results, fast transcription, batch, custom speech, diarization (up to 35 speakers), phrase lists, language identification, timestamps. Real-time multichannel (2 channels, preview). Verified.
- Pricing: the fetched pricing page showed "$-" placeholders, so no figures could be read. Pricing structure: real-time, fast, batch, custom and endpoint hosting are each billed per hour. Unknown figures; check the Azure pricing calculator.
- Languages: count not captured. Language support page is the reference.
- Latency class: real-time or fast (synchronous).
- Accuracy reputation: enterprise-grade; MAI models are new.
- OpenAI-compatible: Azure OpenAI hosts an OpenAI-shaped Whisper/transcribe endpoint, separate from Azure Speech. Unverified in this session.

### 1.9 Google Cloud Speech-to-Text (Chirp 3)

- Model: `chirp_3`, only in Speech-to-Text **V2**. Verified.
- Endpoint: `https://{REGION}-speech.googleapis.com` (us and eu multi-region, GA). Recognition: `StreamingRecognize` (streaming, gRPC), `Recognize` (under 1 minute), `BatchRecognize` (long audio, roughly 1 minute to 1 hour; up to 20 min with word timestamps). Verified.
- Auth: Google OAuth via ADC or service account. No API key path for the V2 gRPC/REST. Env var: `GOOGLE_APPLICATION_CREDENTIALS`.
- Languages: about 111 locale entries; 29 GA, 82 Preview. Verified.
- Features: automatic punctuation and capitalization, utterance timestamps (streaming), speaker diarization (batch and `Recognize`, listed languages), speech adaptation (up to 1000 phrases), language-agnostic (`language_codes=["auto"]`), denoiser. Not supported: word-level confidence. Word-level timestamps contradictory (listed as unsupported, then allowed with quality loss). No translation or keywords on the page. Verified.
- Audio: encoding guide linked; inline size and GCS limits (10 MB / 1 min inline, 480 min GCS) were not on the fetched page. Unverified.
- Pricing: the pricing page fetch was truncated. Secondary: V2 Standard $0.016/min (= $0.96/hr); "dynamic batch" $0.003/min (= $0.18/hr). Whether Chirp 3 bills at the batch SKU is unconfirmed. Verify on the pricing page.
- Latency class: streaming, low.
- Accuracy reputation: strong multilingual; preview status for most locales.
- OpenAI-compatible: no.

### 1.10 Fireworks AI and Together AI (hosted Whisper)

- Fireworks: `https://api.fireworks.ai/inference/v1/audio/transcriptions` (from memory; docs fetch returned 404). Models `whisper-v3`, `whisper-v3-turbo` (names unverified). Auth Bearer, env `FIREWORKS_API_KEY`. OpenAI-compatible, likely.
- Fireworks pricing: serverless whisper-v3-large $0.0015/min (about $0.09/hr), turbo $0.0009/min (about $0.054/hr). This comes from a late-2024 launch post, so it is probably stale. Verify.
- Together AI: Whisper Large v3 is hosted. No reliable 2026 price found. One aggregator listed $0.0000/s, which is a placeholder. Verify.
- Both are batch-only Whisper hosting, with OpenAI-shaped APIs. Not verified in this session.

### 1.11 Rev AI (Reverb)

- Base URL: `https://api.rev.ai/speechtotext/v1` (US). Other regions on the global deployments page. Verified.
- Auth: `Authorization:` header with the access token; the Bearer prefix was not stated on the page. Env var: `REVAI_ACCESS_TOKEN` (convention).
- Streaming: `/api/streaming` (separate Streaming Speech-to-Text API). Endpoint URL not captured. Unverified.
- Models: Reverb (transcription), Reverb Turbo, Reverb Eco, Fusion. The page did not list them. Per secondary (Sonix, aggregators, "June 2026"): Reverb $0.20/hr; Reverb Turbo $0.10/hr; Reverb Foreign Language (57 languages) $0.30/hr. Whisper-based machine ASR $0.005/min (= $0.30/hr); human transcription $1.99/min. Billing per second with a 15 s minimum per file. Verify on rev.ai/pricing.
- Limits: formats via FFmpeg (MP3, MP4, Ogg, WAV, PCM, FLAC, etc.); max duration 17 h; multipart 2 GB per request; source_config up to 5 TB. Verified.
- Features: timestamps, diarization, custom vocabulary: not on fetched page.
- Latency class: batch; streaming exists.
- Accuracy reputation: the Reverb line is positioned as high accuracy for English. Vendor-claimed improvements only.
- OpenAI-compatible: no.

### 1.12 Soniox

- Base URLs: REST `https://api.soniox.com` (from memory); realtime WebSocket `wss://stt-rt.soniox.com/transcribe-websocket` (from memory). Both unconfirmed by the fetch.
- Auth: API key (managed in the Soniox Console). Env var: `SONIOX_API_KEY` (convention).
- Models: `stt-rt-v5` (realtime) is shown on the pricing page. Async v4/v5 names were not confirmed.
- Pricing (soniox.com/pricing, "Updated June 2026"): realtime $0.12/hr; async $0.10/hr. Diarization, language identification, smart formatting and translation are included in the hourly rate. Custom context is billed by input text tokens.
- Languages: 60+ (STT and TTS). Translation: 3,600 language pairs. Verified.
- Features: diarization, language identification, realtime translation, timestamps (claimed by competitor pages), custom context. Custom vocabulary is not confirmed. Verified where stated.
- Latency class: realtime, low (vendor-positioned).
- Accuracy reputation: rising; competitor pages claim it beats others. Not verified.
- OpenAI-compatible: no.

### 1.13 Cartesia Ink (STT)

- Official docs were not readable: the docs URL redirected to a login page. Nothing from the official docs is confirmed.
- Secondary (Soniox comparison pages, a competitor, so biased): Ink 2 streaming about $0.43/hr, English only; a separate `ink-whisper` model for other languages (its streaming status conflicts across pages). Speaker diarization "coming soon" and no translation, per the same pages.
- Recommendation: re-check with a logged-in or accessible copy of the docs before relying on any Cartesia figure.

### 1.14 Mistral Voxtral (Transcribe 2)

- Models (Feb 2026 launch, Voxtral Transcribe 2): batch `Voxtral Mini Transcribe V2` at $0.003/min (= $0.18/hr); realtime `Voxtral Realtime` at $0.006/min (= $0.36/hr). Secondary (the-decoder, Mistral news). The batch and realtime model IDs were not captured from the official page.
- Realtime open weights: `mistralai/Voxtral-Mini-4B-Realtime-2602` on Hugging Face (verified via the docs page link; Apache 2.0 per secondary source).
- Languages: 13 (English, Chinese, Hindi, Spanish, Arabic, French, Portuguese, Russian, German, Japanese, Korean, Italian, Dutch). Verified.
- Features: word-level timestamps and speaker diarization (batch), context biasing / custom vocabulary (batch). Realtime latency configurable down to sub-200 ms (vendor). Verified.
- Limits: up to 3 h in one batch request; file size not captured.
- Endpoint: REST likely `https://api.mistral.ai/v1/audio/transcriptions` (unverified). Auth Bearer, env `MISTRAL_API_KEY` (convention).
- OpenAI-compatible: Mistral's API follows OpenAI-style conventions; exact compatibility of the audio route not verified.

### 1.15 Fish Audio ASR

- Model: `transcribe-1`. Pricing (docs per search snippet): $0.36 per audio hour, billed per second with rounding up. Verified via snippet, not via the full page.
- Endpoint: `POST /v1/asr` (from memory; the docs URL returned 404).
- Concurrency by tier: Starter 5; Elevated 15 (after $100 paid); High Volume 50 (after $1000 paid).
- Languages, timestamps, format and size limits: not captured.
- Free variant on Vercel AI Gateway: `transcribe-1-free` with $5 credits per 30 days (secondary).

### 1.16 Other notable 2026 entries

- **NVIDIA Nemotron 3.5 ASR Streaming Multilingual 0.6B** (open weights, self-host candidate): prompt-conditioned cache-aware streaming; more than 40 languages; $0.000003/s on OpenRouter (= about $0.011/hr, single provider). Released 2026-08-13 per OpenRouter. Secondary. Good candidate for cost-driven self-hosting.
- **Smallest AI Lightning ASR**: vendor claims sub-300 ms, 295 ms time-to-first-transcript, 15+ languages (AWS Marketplace). Vendor claims only.
- **Fano Speech API**: streaming STT released Dec 2025; Cantonese, Mandarin and English code-switching (AWS Marketplace). Vendor claims only.
- **AssemblyAI Universal-Streaming via Telnyx** (since 2026-05-07): English, Spanish, German, French, Portuguese, Italian. Secondary (Telnyx release note).

---

## 2. Price summary (USD per audio hour, list, as found)

| Provider / model | Batch | Realtime / streaming | Source quality |
|---|---|---|---|
| Groq whisper-large-v3-turbo | $0.04 | n/a (batch only) | Verified (model page) |
| Fireworks whisper-v3-turbo | ~$0.054 | n/a | Stale (2024) |
| Soniox | $0.10 | $0.12 | Verified (pricing page, June 2026) |
| Rev Reverb Turbo | $0.10 | n/a | Secondary |
| AssemblyAI universal-2 | $0.15 | n/a | Verified (pricing ref, 2026-09-28) |
| AssemblyAI Universal-Streaming (EN/multi) | n/a | $0.15 | Verified (legacy streaming) |
| Google Chirp 3 (uncertain SKU) | $0.18 or $0.96 | $0.96 (V2 standard) | Secondary / truncated page |
| Mistral Voxtral Transcribe 2 | $0.18 | $0.36 | Secondary (launch news) |
| ElevenLabs Scribe v2 | $0.22 | $0.39 | Verified (official, undated) |
| Deepgram Nova-3 mono | $0.26 | $0.29 | Verified (undated, promo flagged) |
| Deepgram Flux EN | n/a | $0.39 | Verified (undated, promo flagged) |
| OpenAI gpt-transcribe | $0.27 | n/a | Verified (model page) |
| OpenAI gpt-live-transcribe | n/a | $1.02 | Verified (model page) |
| Speechmatics Melia 1 | $0.24 | $0.40 | Verified (pricing page) |
| Speechmatics Standard | $0.45 | $0.45 | Verified |
| Speechmatics Enhanced | $0.75 | $0.80 | Verified |
| Speechmatics Linden 1 | n/a | $0.30 | Verified |
| AssemblyAI Universal-3.5 Pro (async) | $0.21 | n/a | Verified (pricing ref) |
| AssemblyAI Universal-3.6 Pro Realtime | n/a | $0.45 + diarization $0.12 | Verified (pricing ref) |
| Gladia | unknown | ~$0.20 floor (unverified) | Vendor marketing |
| Fish Audio transcribe-1 | $0.36 | n/a | Official snippet |
| Azure Speech | unknown | unknown | Price page showed placeholders |
| Cartesia Ink 2 (streaming) | n/a | ~$0.43 (competitor claim) | Unverified |

---

## 3. Rankings (judgment from vendor-stated specs and reputation, not an independent benchmark)

No independent WER or latency benchmark was run in this session. Rankings below reflect documented language coverage, feature set, pricing and vendor-positioned accuracy. Treat them as a starting shortlist and benchmark on your own audio.

### (a) Best accuracy, multilingual
1. ElevenLabs Scribe v2 (90+ languages, word timestamps, keyterms, vendor claim over 98%)
2. OpenAI gpt-transcribe (multilingual with language hints, streaming, prompts)
3. Deepgram Nova-3 `multi` (about 105 codes, strong on streaming and batch)
4. AssemblyAI Universal-3.5 Pro (async, speaker labels, language detection)
5. Soniox (60+ languages, translation, diarization included)
6. Speechmatics Enhanced (one language per job, high accuracy; Melia 1 for multilingual)
7. Google Chirp 3 (about 111 locales, most in preview)
8. Gladia Solaria-1 (99 languages, translation, realtime)

### (b) Lowest-latency streaming
1. Deepgram Flux (turn-detection built for voice agents; eager EOT for early LLM calls)
2. ElevenLabs Scribe v2 Realtime (vendor claim about 150 ms)
3. Mistral Voxtral Realtime (vendor: configurable sub-200 ms)
4. OpenAI gpt-live-transcribe (streaming via realtime transcription sessions)
5. Soniox realtime (`stt-rt-v5`)
6. AssemblyAI Universal-3.6 Pro Realtime (session-based, turn events)
7. Speechmatics Linden 1 (voice-agent realtime, `max_delay` tunable)
8. Gladia Solaria realtime (vendor: partials under 103 ms, final around 300 ms)

### (c) Cheapest (per audio hour, batch unless noted)
1. Groq whisper-large-v3-turbo ($0.04; batch only, 10 s minimum billing)
2. Soniox async ($0.10)
3. Rev Reverb Turbo ($0.10; secondary source, verify)
4. AssemblyAI universal-2 ($0.15)
5. Mistral Voxtral Transcribe 2 batch ($0.18)
6. ElevenLabs Scribe v2 batch ($0.22)
7. Deepgram Nova-3 mono pre-recorded ($0.26; $0.22 at Growth)
8. OpenAI gpt-transcribe ($0.27)

Self-hosted note: NVIDIA Nemotron 3.5 ASR streaming (open weights) is about $0.011/hr as a hosted rate, which is cheaper still if you run it yourself.

### (d) Best Spanish
1. ElevenLabs Scribe v2 (90+ languages incl. Spanish; batch and realtime)
2. Deepgram Nova-3 `multi` (Spanish in the multilingual model; streaming and batch)
3. OpenAI gpt-transcribe (multilingual, language hints)
4. Speechmatics Melia 1 (56 languages, multilingual product)
5. AssemblyAI Universal-3.5 Pro / Universal-Streaming Multilingual (Spanish in streaming multilingual list, per Telnyx)
6. Soniox (60+ languages)
7. Google Chirp 3 (Spanish is a GA locale in most regions; verify)
8. Mistral Voxtral Transcribe 2 (Spanish in the 13-language list; batch and realtime)

No Spanish-specific WER data was obtained. This ranking reflects language coverage only. Benchmark with Spanish audio that matches your domain (accents, telephony, noise).

---

## 4. OpenAI-compatible endpoints

Compatible with `POST /v1/audio/transcriptions` (multipart, `model`, `file`, `response_format`):
- OpenAI itself (`api.openai.com/v1`; models gpt-transcribe and older deprecated IDs)
- Groq (`api.groq.com/openai/v1`; verified)
- Fireworks (`api.fireworks.ai/inference/v1`; unverified)
- Together AI (likely; unverified)
- Azure OpenAI Whisper/transcribe deployments (general knowledge; separate from Azure Speech)

Not OpenAI-compatible (own schema): Deepgram, ElevenLabs (multipart but own fields), AssemblyAI, Gladia, Speechmatics, Google, Rev AI, Soniox, Azure Speech, Cartesia, Mistral (own route shape, OpenAI-like conventions; unverified).

---

## 5. Proposed minimal common request / response shape

Goal: one internal shape that adapters map to and from. It covers batch and streaming. Field names are proposals.

### Batch request

```
TranscribeRequest {
  provider: "deepgram" | "elevenlabs" | "openai" | "assemblyai" | "groq" | "gladia"
          | "speechmatics" | "azure" | "google" | "rev" | "soniox" | "mistral" | "fish" | ...
  model?: string                 // provider model id; omit for provider default
  audio: {
    source: { kind: "bytes", mime: string, data: Uint8Array }
          | { kind: "url", url: string }
    format?: "wav" | "mp3" | "flac" | "ogg" | "webm" | "m4a" | "pcm_s16le"
    sampleRate?: number           // required for raw PCM
    channels?: number
  }
  language?: string | "auto"      // BCP-47 / ISO 639-1; "auto" = detect
  languageHints?: string[]        // bias list (gpt-transcribe, Deepgram multi, Chirp)
  timestamps?: "none" | "segment" | "word"
  diarization?: { enabled: boolean; maxSpeakers?: number }
  keyterms?: string[]             // custom vocabulary / keywords
  prompt?: string                 // context (OpenAI, Groq up to 224 tokens)
  translateTo?: string            // optional target language
}
```

### Batch response

```
TranscribeResult {
  provider: string
  model: string
  text: string
  language?: string               // detected or requested
  languageConfidence?: number
  durationSeconds: number         // billed audio duration
  words?: { text: string; startMs: number; endMs: number; confidence?: number; speaker?: string }[]
  segments?: { text: string; startMs: number; endMs: number; speaker?: string }[]
  raw?: unknown                   // optional provider payload for debugging
}
```

### Streaming

```
StreamOpen {
  provider, model?, sampleRate, encoding: "pcm_s16le" | "mulaw" | "alaw" | "opus"
  languageHints?, keyterms?, diarization?, interim: boolean
  turnDetection?: { eotThreshold?: number; eagerEot?: number; timeoutMs?: number }
}

// audio in: binary frames, ~80-100 ms each

StreamEvent =
  | { type: "partial"; text: string; startMs: number; endMs?: number; language?: string }
  | { type: "final";   text: string; startMs: number; endMs: number; words?: Word[]; speaker?: string }
  | { type: "turn_end"; text: string; confidence?: number }           // end-of-turn (Deepgram EndOfTurn, AssemblyAI end_of_turn, Gladia/Soniox equivalents)
  | { type: "turn_resumed" }                                          // Deepgram TurnResumed
  | { type: "error"; code: string; message: string; retryable: boolean }
  | { type: "session_end"; audioSeconds: number; billedSeconds?: number }
```

Mapping notes:
- Deepgram Flux: `EndOfTurn`, `EagerEndOfTurn`, `TurnResumed` map to `turn_end` and `turn_resumed`.
- AssemblyAI: `Turn` with `end_of_turn: true` maps to `turn_end`. Billing is by connection time, so `session_end` should report connection duration.
- OpenAI realtime: `transcript.text.delta` maps to `partial`; `transcript.text.done` maps to `final`.
- ElevenLabs realtime: `commit` strategy decides `final`. Confirm event names when implementing.
- Groq and Google batch-only paths: no stream, only `TranscribeRequest` and `TranscribeResult`.

---

## 6. Uncertain items and what to verify

- OpenAI: the current docs say gpt-transcribe and gpt-live-transcribe are recommended and the older models shut down on 2027-02-26. This is the most important 2026 change. The realtime WebSocket URL is still unconfirmed. The pricing page (openai.com/api/pricing) returned 403.
- Deepgram: pricing page is undated and labels streaming rates as limited-time promotional; the regular rate is higher. Flux language list not captured.
- ElevenLabs: realtime WebSocket URL and model ID not captured; batch price conflicts across sources ($0.22 official vs $0.27 secondary).
- AssemblyAI: "Universal-3 Slam" does not exist. SLAM-1 is deprecated. The pricing page has an internal 3.5 vs 3.6 naming conflict.
- Gladia: `solaria-3` existence conflicts between the live docs and a blog. Pricing unverified.
- Speechmatics: realtime and batch base URLs are unconfirmed; Oak 1 realtime price may be inconsistent.
- Azure Speech: pricing page showed placeholders; endpoints from general knowledge.
- Google Chirp 3: pricing page truncated; SKU for Chirp 3 unclear ($0.016/min standard vs $0.003/min dynamic batch).
- Mistral Voxtral: exact model IDs and REST and WebSocket endpoints not captured from the official page.
- Fish Audio: endpoint and language list unverified (docs URL returned 404).
- Fireworks, Together: prices stale or missing; endpoints unverified.
- Rev AI: streaming endpoint and model list not captured; prices from secondary sources.
- Soniox: WebSocket and REST endpoints and async model names not confirmed from docs.
- Cartesia: official docs unreadable (login redirect). Only competitor claims.
- Latency and accuracy numbers throughout are vendor claims. No independent benchmark was run.

Sources (official unless marked):
- Deepgram pricing: https://deepgram.com/pricing ; flux quickstart: https://developers.deepgram.com/docs/flux/quickstart ; models: https://developers.deepgram.com/docs/models-languages-overview
- ElevenLabs pricing: https://elevenlabs.io/pricing/api ; convert: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
- OpenAI models: https://developers.openai.com/api/docs/models/gpt-transcribe.md , https://developers.openai.com/api/docs/models/gpt-live-transcribe.md , https://developers.openai.com/api/docs/guides/speech-to-text
- AssemblyAI pricing: https://www.assemblyai.com/pricing.md ; streaming: https://www.assemblyai.com/docs/speech-to-text/universal-streaming ; async: https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio
- Groq: https://console.groq.com/docs/speech-to-text ; model: https://console.groq.com/docs/model/whisper-large-v3-turbo
- Gladia live: https://docs.gladia.io/api-reference/v2/live/init
- Speechmatics pricing: https://www.speechmatics.com/pricing
- Azure overview (2026-10-02): https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-to-text
- Google Chirp 3: https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3 ; pricing (truncated): https://cloud.google.com/speech-to-text/pricing
- Rev AI async: https://docs.rev.ai/api/asynchronous/
- Soniox pricing: https://soniox.com/pricing ; docs: https://soniox.com/docs
- Mistral audio: https://docs.mistral.ai/capabilities/audio_transcription
- Fish Audio pricing (secondary snippet): https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits
- Secondary: Telnyx AssemblyAI release note (https://telnyx.com/release-notes/assemblyai-stt-api-mission-control), the-decoder Voxtral pricing (https://the-decoder.com/voxtral-transcribe-2-offers-speech-recognition-at-0-003-per-minute/), OpenRouter Chirp and Nemotron pages, Sonix Rev review (https://sonix.ai/resources/rev-review-pricing/amp/), Soniox comparison pages (competitor-authored, used only for Cartesia claims).
