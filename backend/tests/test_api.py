import unittest
import asyncio
import os
import tempfile
import aiosqlite
from starlette.testclient import TestClient
from pathlib import Path

# Override DB path for testing before importing app
import backend.app.config as config
test_dir = tempfile.TemporaryDirectory()
config.DATA_DIR = Path(test_dir.name)
config.DB_PATH = config.DATA_DIR / "test_promptforge.db"
config.MODELS_FILE = config.DATA_DIR / "test_models.json"

from backend.app.main import app
from backend.app.database import init_db, get_db
from backend.app.routes.sessions import save_assistant_message

class PromptForgeBackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        asyncio.run(init_db())
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        test_dir.cleanup()

    def test_01_health_check(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok", "service": "promptforge"})

    def test_02_create_and_get_session(self):
        # Create a session
        create_res = self.client.post("/api/sessions", json={"title": "Test Cyberpunk Portrait"})
        self.assertEqual(create_res.status_code, 200)
        data = create_res.json()
        self.assertIn("id", data)
        self.assertEqual(data["title"], "Test Cyberpunk Portrait")
        session_id = data["id"]

        # Fetch the session
        get_res = self.client.get(f"/api/sessions/{session_id}")
        self.assertEqual(get_res.status_code, 200)
        sess_data = get_res.json()
        self.assertEqual(sess_data["id"], session_id)
        self.assertEqual(sess_data["title"], "Test Cyberpunk Portrait")
        self.assertEqual(sess_data["messages"], [])

    def test_03_thinking_persistence_and_retrieval(self):
        # Create session
        create_res = self.client.post("/api/sessions", json={"title": "Thinking Test"})
        session_id = create_res.json()["id"]

        # Directly save an assistant message with thinking
        msg_id = "test-asst-msg-1"
        now = 1234567890
        content = "Hyper-realistic portrait of an astronaut on Mars"
        thinking = "Analyzing visual elements: lighting, composition, atmospheric dust"

        asyncio.run(save_assistant_message(session_id, msg_id, content, now, thinking))

        # Retrieve session and verify thinking field is preserved
        get_res = self.client.get(f"/api/sessions/{session_id}")
        self.assertEqual(get_res.status_code, 200)
        sess_data = get_res.json()
        self.assertEqual(len(sess_data["messages"]), 1)
        saved_msg = sess_data["messages"][0]
        self.assertEqual(saved_msg["id"], msg_id)
        self.assertEqual(saved_msg["content"], content)
        self.assertEqual(saved_msg["thinking"], thinking)

    def test_04_schema_migration_backward_compatibility(self):
        # Test that init_db() properly detects if table is missing thinking and adds it
        async def run_migration_check():
            async with aiosqlite.connect(config.DB_PATH) as db:
                async with db.execute("PRAGMA table_info(messages)") as cursor:
                    cols = [r[1] for r in await cursor.fetchall()]
                    self.assertIn("thinking", cols)
        asyncio.run(run_migration_check())

    def test_05_update_and_delete_session(self):
        create_res = self.client.post("/api/sessions", json={"title": "Session to Delete"})
        session_id = create_res.json()["id"]

        # Update title and model
        patch_res = self.client.patch(f"/api/sessions/{session_id}", json={
            "title": "Renamed Session",
            "model": "deepseek-ai/DeepSeek-R1-0528"
        })
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["title"], "Renamed Session")
        self.assertEqual(patch_res.json()["model"], "deepseek-ai/DeepSeek-R1-0528")

        # Delete session
        del_res = self.client.delete(f"/api/sessions/{session_id}")
        self.assertEqual(del_res.status_code, 200)

        # Verify 404
        get_res = self.client.get(f"/api/sessions/{session_id}")
        self.assertEqual(get_res.status_code, 404)

    def test_06_models_config_endpoints(self):
        # Get models
        get_models = self.client.get("/api/models")
        self.assertEqual(get_models.status_code, 200)
        models_data = get_models.json()
        self.assertIn("models", models_data)
        self.assertIn("default_model", models_data)

        # Add custom model
        custom_model = {
            "id": "custom/prompt-expert-v1",
            "name": "Prompt Expert v1",
            "description": "Specialized in lighting keywords",
            "supports_thinking": True,
            "is_default": False
        }
        add_res = self.client.post("/api/models", json=custom_model)
        self.assertEqual(add_res.status_code, 200)
        updated_models = [m["id"] for m in add_res.json()["models"]]
        self.assertIn("custom/prompt-expert-v1", updated_models)

        # Update settings
        patch_settings = self.client.patch("/api/models/settings", json={
            "default_model": "custom/prompt-expert-v1",
            "default_thinking": "max"
        })
        self.assertEqual(patch_settings.status_code, 200)
        self.assertEqual(patch_settings.json()["default_model"], "custom/prompt-expert-v1")
        self.assertEqual(patch_settings.json()["default_thinking"], "max")

        # Delete custom model
        del_model = self.client.delete("/api/models/custom%2Fprompt-expert-v1")
        self.assertEqual(del_model.status_code, 200)
        models_after_del = [m["id"] for m in del_model.json()["models"]]
        self.assertNotIn("custom/prompt-expert-v1", models_after_del)

    def test_07_markdown_codeblock_stripping(self):
        # When assistant output is enclosed in ```markdown ... ```, it should strip code fence
        create_res = self.client.post("/api/sessions", json={"title": "Code Block Strip Test"})
        session_id = create_res.json()["id"]

        enclosed_prompt = "```markdown\nA cinematic macro photograph of a bioluminescent jellyfish\n```"
        asyncio.run(save_assistant_message(session_id, "strip-test-1", enclosed_prompt, 1234567, "Thinking..."))

        get_res = self.client.get(f"/api/sessions/{session_id}")
        saved_msg = get_res.json()["messages"][0]
        self.assertEqual(saved_msg["content"], "A cinematic macro photograph of a bioluminescent jellyfish")

    def test_08_empty_and_special_character_session(self):
        # Empty title fallback
        res = self.client.post("/api/sessions", json={"title": ""})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["title"], "New Session")

        # Session with unicode/emoji and special characters
        unicode_title = "🎨 日本の雨 & Cyberpunk Neon 100% #1!"
        res_u = self.client.post("/api/sessions", json={"title": unicode_title})
        self.assertEqual(res_u.status_code, 200)
        u_id = res_u.json()["id"]

        get_u = self.client.get(f"/api/sessions/{u_id}")
        self.assertEqual(get_u.json()["title"], unicode_title)

if __name__ == "__main__":
    unittest.main()
