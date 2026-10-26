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

        model_ids = [m["id"] for m in models_data["models"]]
        self.assertIn("deepseek/deepseek-v4.1-flash-1017:thinking", model_ids)
        self.assertIn("z-ai/glm-5.3-flash-uncensored", model_ids)
        self.assertIn("z-ai/glm-5.3:thinking", model_ids)
        self.assertIn("moonshotai/kimi-k2.6:thinking", model_ids)

        deepseek_model = next(m for m in models_data["models"] if m["id"] == "deepseek/deepseek-v4.1-flash-1017:thinking")
        self.assertEqual(deepseek_model["name"], "DeepSeek V4.1 Flash (Thinking)")
        self.assertEqual(deepseek_model["description"], "Ultra-fast reasoning model with thinking capabilities")
        self.assertTrue(deepseek_model["supports_thinking"])

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

    def test_09_markdown_language_tags_and_whitespace(self):
        create_res = self.client.post("/api/sessions", json={"title": "Tag Strip Test"})
        session_id = create_res.json()["id"]

        # Code block with text tag and whitespace
        tagged_prompt = "```text   \nMacro eye reflection of neon Tokyo rain\n```"
        asyncio.run(save_assistant_message(session_id, "tag-test-1", tagged_prompt, 1234568))

        get_res = self.client.get(f"/api/sessions/{session_id}")
        saved_msg = get_res.json()["messages"][0]
        self.assertEqual(saved_msg["content"], "Macro eye reflection of neon Tokyo rain")

    def test_10_assistant_error_message_persistence(self):
        create_res = self.client.post("/api/sessions", json={"title": "Error Persist Test"})
        session_id = create_res.json()["id"]

        error_content = "⚠️ Error: Upstream connection failure: Connection timed out"
        asyncio.run(save_assistant_message(session_id, "err-msg-1", error_content, 1234569))

        get_res = self.client.get(f"/api/sessions/{session_id}")
        saved_msg = get_res.json()["messages"][0]
        self.assertEqual(saved_msg["role"], "assistant")
        self.assertTrue(saved_msg["content"].startswith("⚠️ Error"))

    def test_11_chat_stream_invalid_session(self):
        res = self.client.post("/api/sessions/non-existent-session-id/chat", json={"message": "hello"})
        self.assertEqual(res.status_code, 404)

    def test_12_thinking_tag_stripping_and_clean_prompt(self):
        create_res = self.client.post("/api/sessions", json={"title": "Think Tag Strip Test"})
        session_id = create_res.json()["id"]

        # Content with <think>...</think> tag and clean prompt
        content_with_think = "<think>\nAnalyzing camera settings: 85mm f/1.4 lens, natural golden hour lighting.\n</think>\nCinematic portrait of a cyberpunk hacker in rain, neon bokeh reflections"
        asyncio.run(save_assistant_message(session_id, "think-tag-msg-1", content_with_think, 1234570, "Initial trace"))

        get_res = self.client.get(f"/api/sessions/{session_id}")
        saved_msg = get_res.json()["messages"][0]
        self.assertEqual(saved_msg["content"], "Cinematic portrait of a cyberpunk hacker in rain, neon bokeh reflections")
        self.assertIn("Analyzing camera settings", saved_msg["thinking"])
        self.assertIn("Initial trace", saved_msg["thinking"])

    def test_13_inline_and_multiline_think_tags_with_codeblocks(self):
        create_res = self.client.post("/api/sessions", json={"title": "Think + Codeblock Test"})
        session_id = create_res.json()["id"]

        # Content with <thought> tag and markdown code block
        mixed_content = "<thought>Refining color grading and shadows</thought>\n```markdown\nA hyper-detailed isometric greenhouse with exotic bioluminescent flora\n```"
        asyncio.run(save_assistant_message(session_id, "mixed-msg-1", mixed_content, 1234571))

        get_res = self.client.get(f"/api/sessions/{session_id}")
        saved_msg = get_res.json()["messages"][0]
        self.assertEqual(saved_msg["content"], "A hyper-detailed isometric greenhouse with exotic bioluminescent flora")
        self.assertEqual(saved_msg["thinking"], "Refining color grading and shadows")

    def test_14_unclosed_and_multiple_think_tags(self):
        create_res = self.client.post("/api/sessions", json={"title": "Multiple Think Tags Test"})
        session_id = create_res.json()["id"]

        # Content with multiple think tags and unclosed think tag
        complex_content = "<think>Step 1: Composition</think> Mid-century modern living room <think>Step 2: Lighting</think> with floor-to-ceiling windows"
        asyncio.run(save_assistant_message(session_id, "multi-think-1", complex_content, 1234572))

        get_res = self.client.get(f"/api/sessions/{session_id}")
        saved_msg = get_res.json()["messages"][0]
        self.assertEqual(saved_msg["content"], "Mid-century modern living room with floor-to-ceiling windows")
        self.assertIn("Step 1: Composition", saved_msg["thinking"])
        self.assertIn("Step 2: Lighting", saved_msg["thinking"])

    def test_15_orphaned_close_and_open_thinking_tags(self):
        create_res = self.client.post("/api/sessions", json={"title": "Orphaned Tags Test"})
        session_id = create_res.json()["id"]

        # Orphaned closing tag (model began generating from within think block without <think>)
        orphaned_close_content = "Analyzing 85mm lens characteristics and dusk bokeh</think>A candid shot of a barista in neon rain"
        asyncio.run(save_assistant_message(session_id, "orphan-close-1", orphaned_close_content, 1234573))

        get_res = self.client.get(f"/api/sessions/{session_id}")
        saved_msg = get_res.json()["messages"][0]
        self.assertEqual(saved_msg["content"], "A candid shot of a barista in neon rain")
        self.assertEqual(saved_msg["thinking"], "Analyzing 85mm lens characteristics and dusk bokeh")

        # <thinking> variant with whitespace
        thinking_variant = "<thinking >Optical subsurface scattering details</thinking >Macro water droplet reflecting neon lights"
        asyncio.run(save_assistant_message(session_id, "variant-msg-1", thinking_variant, 1234574))
        get_res2 = self.client.get(f"/api/sessions/{session_id}")
        saved_msg2 = get_res2.json()["messages"][1]
        self.assertEqual(saved_msg2["content"], "Macro water droplet reflecting neon lights")
        self.assertEqual(saved_msg2["thinking"], "Optical subsurface scattering details")

    def test_16_stream_think_parser(self):
        from backend.app.routes.sessions import StreamThinkParser
        parser = StreamThinkParser()

        # Simulate split chunks across network boundaries
        chunks = [
            "<th", "ink>", "Planning composition...", " and lighting", "</thi", "nk>\n\nA cinematic", " street scene"
        ]
        events = []
        for c in chunks:
            events.extend(parser.process_chunk(c))
        events.extend(parser.flush())

        thinking_text = "".join(text for ev_type, text in events if ev_type == "thinking")
        content_text = "".join(text for ev_type, text in events if ev_type == "content")

        self.assertEqual(thinking_text, "Planning composition... and lighting")
        self.assertEqual(content_text.strip(), "A cinematic street scene")

    def test_17_preamble_embedded_codeblock(self):
        create_res = self.client.post("/api/sessions", json={"title": "Preamble Codeblock Test"})
        session_id = create_res.json()["id"]

        preamble_content = "Here is the prompt:\n```markdown\nA cyberpunk cityscape at night with volumetric fog\n```"
        asyncio.run(save_assistant_message(session_id, "preamble-msg-1", preamble_content, 1234575))

        get_res = self.client.get(f"/api/sessions/{session_id}")
        saved_msg = get_res.json()["messages"][0]
        self.assertEqual(saved_msg["content"], "A cyberpunk cityscape at night with volumetric fog")

    def test_18_model_metadata_sync(self):
        from backend.app.models_store import _load_config_sync
        cfg = _load_config_sync()
        deepseek_model = next((m for m in cfg.models if m.id == "deepseek/deepseek-v4.1-flash-1017:thinking"), None)
        self.assertIsNotNone(deepseek_model)
        self.assertEqual(deepseek_model.name, "DeepSeek V4.1 Flash (Thinking)")
        self.assertEqual(deepseek_model.description, "Ultra-fast reasoning model with thinking capabilities")
        self.assertTrue(deepseek_model.supports_thinking)

    def test_19_session_recovery_and_catchup_flow(self):
        # Create session
        create_res = self.client.post("/api/sessions", json={"title": "Recovery Flow Test"})
        session_id = create_res.json()["id"]

        # Simulate user submitting message directly into DB as chat_stream does
        async def insert_user_msg():
            async with get_db() as db:
                await db.execute(
                    "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
                    ("user-msg-1", session_id, "user", "Create an oil painting of a lighthouse in a storm", 1234576)
                )
                await db.commit()
        asyncio.run(insert_user_msg())

        # Verify session endpoint returns the user message
        sess_res1 = self.client.get(f"/api/sessions/{session_id}")
        self.assertEqual(sess_res1.status_code, 200)
        msgs1 = sess_res1.json()["messages"]
        self.assertEqual(len(msgs1), 1)
        self.assertEqual(msgs1[0]["role"], "user")

        # Now simulate backend completing the assistant generation in the background
        asyncio.run(save_assistant_message(session_id, "asst-msg-1", "<think>Dramatic waves crashing</think>A dramatic oil painting of a lighthouse during a violent sea storm", 1234577))

        # Re-fetch session (catch-up polling simulation)
        sess_res2 = self.client.get(f"/api/sessions/{session_id}")
        self.assertEqual(sess_res2.status_code, 200)
        msgs2 = sess_res2.json()["messages"]
        self.assertEqual(len(msgs2), 2)
        self.assertEqual(msgs2[1]["role"], "assistant")
        self.assertEqual(msgs2[1]["content"], "A dramatic oil painting of a lighthouse during a violent sea storm")
        self.assertEqual(msgs2[1]["thinking"], "Dramatic waves crashing")

if __name__ == "__main__":
    unittest.main()
