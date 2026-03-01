"""
End-to-end voice pipeline eval:
  1. Generate test audio from text prompts (macOS `say`)
  2. Transcribe with Voxtral (Mistral ASR)
  3. Generate comedy response (fine-tuned LLM)
  4. Judge response quality (Mistral Large)
  5. Generate TTS of the response (macOS `say`)
  6. Log everything to W&B (table + audio + scores)

Usage:
    python eval_voice.py --model ft:open-mistral-7b:xxx:comedy-narrator
    python eval_voice.py --model ft:open-mistral-7b:xxx:comedy-narrator --compare
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import wandb
from mistralai import Mistral

SYSTEM_PROMPT = (
    "You are a sharp-witted, darkly funny AI game narrator. "
    "You deliver punchlines like a standup comedian. "
    "Keep responses short (1-3 sentences), punchy, and comedically timed."
)

# Simulate what a player would actually say into the mic
VOICE_PROMPTS = [
    "oh no I fell off the cliff again",
    "I just shot my teammate sorry",
    "where do I go I'm so lost",
    "this boss is impossible how do I beat it",
    "fire fire fire shoot everything",
    "I keep dying what am I doing wrong",
    "I accidentally dropped my sword",
    "tell me a joke while I wait for respawn",
    "I've been playing for six hours and I'm still on level one",
    "my shield is broken and I have no health",
]

JUDGE_PROMPT = """\
You are evaluating an AI game narrator's response to a player's voice input. \
The narrator should be funny, coherent, and contextually aware.

Player said (transcribed from voice): "{transcript}"
Original text (ground truth): "{original}"
Narrator response: "{response}"

Score on these 5 dimensions (1-5 each):

1. **coherence**: Grammatically correct, logically consistent, natural English. \
(1=gibberish/repetitive, 5=perfectly clear)
2. **humor**: Genuinely funny or witty. (1=not at all, 5=laugh out loud)
3. **relevance**: Addresses the player's actual situation/input. \
(1=completely off-topic, 5=directly references what they said)
4. **brevity**: Concise and well-timed delivery. (1=rambling, 5=tight punchline)
5. **voice_fit**: Would this sound good spoken aloud? Natural spoken cadence, \
no awkward written-only constructs. (1=reads like an essay, 5=sounds great as speech)

Return ONLY valid JSON:
{{"coherence": <int>, "humor": <int>, "relevance": <int>, "brevity": <int>, "voice_fit": <int>}}"""

WANDB_PROJECT = "mistral-comedy-ft"
JUDGE_MODEL = "mistral-large-latest"
ASR_MODEL = "voxtral-mini-latest"
AUDIO_DIR = Path("eval_audio")


def text_to_wav(text, output_path, voice="Samantha", rate=180):
    """Use macOS `say` to generate a WAV file from text."""
    aiff_path = output_path.with_suffix(".aiff")
    subprocess.run(
        ["say", "-v", voice, "-r", str(rate), "-o", str(aiff_path), text],
        check=True,
        capture_output=True,
    )
    # Convert AIFF to WAV (16kHz mono) for Voxtral
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1",
         str(aiff_path), str(output_path)],
        check=True,
        capture_output=True,
    )
    aiff_path.unlink(missing_ok=True)
    return output_path


def transcribe_audio(client, audio_path):
    """Transcribe a WAV file using Mistral Voxtral."""
    with open(audio_path, "rb") as f:
        result = client.audio.transcriptions.complete(
            model=ASR_MODEL,
            file={"content": f, "file_name": audio_path.name},
        )
    return result.text.strip() if hasattr(result, "text") else str(result).strip()


def generate_response(client, model, transcript):
    """Generate a comedy response from the narrator model."""
    resp = client.chat.complete(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": transcript},
        ],
        max_tokens=150,
        temperature=0.8,
    )
    return resp.choices[0].message.content.strip()


def response_to_wav(text, output_path, voice="Daniel", rate=170):
    """Use macOS `say` to speak the narrator's response to a WAV file."""
    aiff_path = output_path.with_suffix(".aiff")
    subprocess.run(
        ["say", "-v", voice, "-r", str(rate), "-o", str(aiff_path), text],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1",
         str(aiff_path), str(output_path)],
        check=True,
        capture_output=True,
    )
    aiff_path.unlink(missing_ok=True)
    return output_path


def judge_response(client, original, transcript, response):
    """LLM-as-judge scoring."""
    msg = JUDGE_PROMPT.format(
        transcript=transcript, original=original, response=response
    )
    resp = client.chat.complete(
        model=JUDGE_MODEL,
        messages=[{"role": "user", "content": msg}],
        max_tokens=100,
        temperature=0.0,
    )
    raw = resp.choices[0].message.content.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        scores = json.loads(raw)
        for key in ("coherence", "humor", "relevance", "brevity", "voice_fit"):
            scores[key] = max(1, min(5, int(scores[key])))
        return scores
    except (json.JSONDecodeError, KeyError, ValueError):
        print(f"  [Judge parse error] {raw}")
        return None


def compute_averages(results):
    dims = ("coherence", "humor", "relevance", "brevity", "voice_fit")
    avgs = {}
    for dim in dims:
        vals = [r[dim] for r in results if dim in r]
        avgs[dim] = sum(vals) / len(vals) if vals else 0
    avgs["overall"] = sum(avgs[d] for d in dims) / len(dims) if avgs else 0
    return avgs


def run_pipeline(client, model_id, model_label, prompts, log_audio=True):
    """Run full voice pipeline for a set of prompts."""
    results = []
    audio_artifacts = []

    for i, original_text in enumerate(prompts):
        print(f"\n[{i+1}/{len(prompts)}] \"{original_text}\"")

        # Step 1: TTS -> audio file
        input_wav = AUDIO_DIR / f"input_{i:02d}.wav"
        text_to_wav(original_text, input_wav)
        print(f"  Audio generated: {input_wav}")

        # Step 2: ASR -> transcript
        transcript = transcribe_audio(client, input_wav)
        print(f"  Transcribed: \"{transcript}\"")

        # Step 3: LLM -> comedy response
        response = generate_response(client, model_id, transcript)
        print(f"  [{model_label}]: {response}")

        # Step 4: Judge
        scores = judge_response(client, original_text, transcript, response)
        score_str = " ".join(f"{k[0].upper()}={v}" for k, v in scores.items()) if scores else "judge failed"
        print(f"  Scores: {score_str}")

        # Step 5: TTS the response
        output_wav = AUDIO_DIR / f"output_{model_label}_{i:02d}.wav"
        response_to_wav(response, output_wav)

        result = {
            "original": original_text,
            "transcript": transcript,
            "response": response,
            "model": model_label,
            "input_audio": str(input_wav),
            "output_audio": str(output_wav),
        }
        if scores:
            result.update(scores)
        results.append(result)
        audio_artifacts.append((input_wav, output_wav))

    return results, audio_artifacts


def main():
    parser = argparse.ArgumentParser(description="Voice pipeline eval with W&B")
    parser.add_argument("--model", required=True, help="Fine-tuned model ID")
    parser.add_argument("--base", default="open-mistral-7b", help="Base model")
    parser.add_argument("--compare", action="store_true", help="Compare ft vs base")
    args = parser.parse_args()

    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        print("ERROR: Set MISTRAL_API_KEY")
        sys.exit(1)

    client = Mistral(api_key=api_key)
    AUDIO_DIR.mkdir(exist_ok=True)

    run = wandb.init(
        project=WANDB_PROJECT,
        name=f"voice-eval-{args.model.split(':')[-1] if ':' in args.model else 'model'}",
        tags=["eval", "voice-pipeline", "llm-judge"],
        config={
            "ft_model": args.model,
            "base_model": args.base,
            "asr_model": ASR_MODEL,
            "judge_model": JUDGE_MODEL,
            "n_prompts": len(VOICE_PROMPTS),
            "pipeline": "TTS(say) -> Voxtral ASR -> LLM -> Judge -> TTS(say)",
        },
    )

    # Run fine-tuned model
    print("=" * 60)
    print("Evaluating fine-tuned model through voice pipeline")
    print("=" * 60)
    ft_results, ft_audio = run_pipeline(client, args.model, "ft", VOICE_PROMPTS)

    base_results, base_audio = [], []
    if args.compare:
        print("\n" + "=" * 60)
        print("Evaluating base model through voice pipeline")
        print("=" * 60)
        base_results, base_audio = run_pipeline(client, args.base, "base", VOICE_PROMPTS)

    # Build W&B table with audio
    if args.compare:
        cols = [
            "original_text", "transcript", "input_audio",
            "ft_response", "ft_audio", "ft_coherence", "ft_humor", "ft_relevance", "ft_brevity", "ft_voice_fit",
            "base_response", "base_audio", "base_coherence", "base_humor", "base_relevance", "base_brevity", "base_voice_fit",
        ]
        rows = []
        for ft, base in zip(ft_results, base_results):
            rows.append([
                ft["original"],
                ft["transcript"],
                wandb.Audio(ft["input_audio"], sample_rate=16000),
                ft["response"],
                wandb.Audio(ft["output_audio"], sample_rate=16000),
                ft.get("coherence", ""), ft.get("humor", ""),
                ft.get("relevance", ""), ft.get("brevity", ""), ft.get("voice_fit", ""),
                base["response"],
                wandb.Audio(base["output_audio"], sample_rate=16000),
                base.get("coherence", ""), base.get("humor", ""),
                base.get("relevance", ""), base.get("brevity", ""), base.get("voice_fit", ""),
            ])
        run.log({"voice_eval": wandb.Table(columns=cols, data=rows)})

        # Summary scores
        ft_avgs = compute_averages(ft_results)
        base_avgs = compute_averages(base_results)
        for dim, val in ft_avgs.items():
            run.summary[f"ft_{dim}"] = round(val, 2)
        for dim, val in base_avgs.items():
            run.summary[f"base_{dim}"] = round(val, 2)

        dims = ["coherence", "humor", "relevance", "brevity", "voice_fit", "overall"]
        print(f"\n{'Dimension':<12} {'Fine-tuned':>10} {'Base':>10} {'Delta':>10}")
        print("-" * 44)
        for dim in dims:
            delta = ft_avgs[dim] - base_avgs[dim]
            sign = "+" if delta > 0 else ""
            print(f"{dim:<12} {ft_avgs[dim]:>10.2f} {base_avgs[dim]:>10.2f} {sign}{delta:>9.2f}")
    else:
        cols = [
            "original_text", "transcript", "input_audio",
            "response", "response_audio",
            "coherence", "humor", "relevance", "brevity", "voice_fit",
        ]
        rows = []
        for r in ft_results:
            rows.append([
                r["original"], r["transcript"],
                wandb.Audio(r["input_audio"], sample_rate=16000),
                r["response"],
                wandb.Audio(r["output_audio"], sample_rate=16000),
                r.get("coherence", ""), r.get("humor", ""),
                r.get("relevance", ""), r.get("brevity", ""), r.get("voice_fit", ""),
            ])
        run.log({"voice_eval": wandb.Table(columns=cols, data=rows)})

        avgs = compute_averages(ft_results)
        for dim, val in avgs.items():
            run.summary[dim] = round(val, 2)
        print(f"\n{'Dimension':<12} {'Score':>10}")
        print("-" * 24)
        for dim in ["coherence", "humor", "relevance", "brevity", "voice_fit", "overall"]:
            print(f"{dim:<12} {avgs[dim]:>10.2f}")

    # Upload audio files as artifact
    artifact = wandb.Artifact("voice-eval-audio", type="evaluation")
    artifact.add_dir(str(AUDIO_DIR))
    run.log_artifact(artifact)

    run.finish()
    print(f"\nVoice eval logged to W&B: {run.url}")


if __name__ == "__main__":
    main()
