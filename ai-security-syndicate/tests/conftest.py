import os
import tempfile

# Keep tests away from the user's real lesson store (read at import time).
os.environ.setdefault("SYNDICATE_LESSONS", os.path.join(tempfile.mkdtemp(prefix="syndicate-test-"), "lessons.jsonl"))
