# Design Choices

## Dataset Selection
- **zachgitt/comedy-transcripts** (~419 transcripts, chunked into ~1,349 segments) - standup comedy for voice/cadence style
- **ysharma/short_jokes** (~231K jokes, sampled 3K) - one-liners for punchy game narration
- Alternative: generate synthetic game-specific humor with Mistral Large (distillation approach, like the Chilean hackathon winner)
- Alternative: scrape r/ProgrammerHumor or r/gaming for more domain-specific jokes

## Data Processing
- Transcript chunking uses paragraph breaks + 300-char max. Could use sentence-level splitting with spacy for cleaner boundaries
- Short jokes filtered to 20-280 chars. Could use a quality classifier to pick the best ones instead of random sampling
- System prompt baked into every training example. Alternative: omit system prompt and rely on fine-tuned behavior alone
- User prompts are randomly varied ("tell me a joke", "make me laugh", etc.) to avoid overfitting to one trigger phrase

## Model Choice
- **open-mistral-7b** - cheapest ($4 min), fastest to fine-tune. Swap to `mistral-small-latest` for better quality if budget allows
- 300 training steps at lr=1e-4. Could sweep: {100, 300, 500} steps x {5e-5, 1e-4, 3e-4} lr

## Training Strategy
- Using Mistral's hosted fine-tuning API (not local). Compute happens on their servers, ~15-30 min for this data size
- Alternative: use `mistral-finetune` open-source repo on GCP A10 for more control (LoRA, custom schedules)
- W&B tracks config, data artifacts, and eval comparisons

## Eval

### Text eval (`test_model.py`)
- Mistral Large as LLM judge, scores: coherence, humor, relevance, brevity (1-5 each)
- Side-by-side ft vs base comparison table in W&B
- Alternative: human A/B preference test, or multiple judge models for consensus

### Voice pipeline eval (`eval_voice.py`)
- Full loop: macOS `say` TTS -> Voxtral ASR -> comedy LLM -> judge -> `say` TTS response
- Adds **voice_fit** dimension (does it sound good spoken aloud?)
- Audio files (input + output) logged as `wandb.Audio` in the eval table — playable in W&B UI
- Uses macOS `say` for TTS — alternative: Bark, Coqui, or ElevenLabs for more natural voice
- `Samantha` voice for player input, `Daniel` voice for narrator output

## Integration with Game
- Pipeline: Voxtral ASR -> fine-tuned LLM -> TTS
- The system prompt in training data matches what the game will use at inference
- Could add game-state context to prompts (health, inventory, location) for more situational humor
