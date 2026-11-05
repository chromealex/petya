"""Validate model-token lengths using the local pinned base tokenizer."""
import json
import sys
from pathlib import Path
from transformers import AutoTokenizer

root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent
tok = AutoTokenizer.from_pretrained(sys.argv[1], local_files_only=True)
stats = {}
for split in ['train', 'holdout']:
    rows = [json.loads(s) for s in (root / f'{split}.jsonl').read_text().splitlines()]
    sizes = []
    for row in rows:
        messages = row['messages']
        prefix = tok.apply_chat_template(messages[:-1], add_generation_prompt=True,
                                        enable_thinking=False, return_dict=False)
        assert isinstance(prefix, list) and all(isinstance(x, int) for x in prefix)
        completion = tok.encode(messages[-1]['content'] + '<|im_end|>', add_special_tokens=False)
        sizes.append(len(prefix) + len(completion))
    assert max(sizes) <= 512, max(sizes)
    stats[split] = dict(records=len(rows), maxTokens=max(sizes), minTokens=min(sizes))
(root / 'validation.json').write_text(json.dumps(stats, indent=2) + '\n')
print(stats)
