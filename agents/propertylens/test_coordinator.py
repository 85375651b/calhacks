import json
from pathlib import Path
import tempfile
import unittest

from coordinator import Coordinator, History


class CoordinatorTests(unittest.TestCase):
    def test_tool_execution_and_followup_survive_restart_without_duplicate_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "history.sqlite"
            calls = []
            turn = 0

            def http(url, *, token, payload=None):
                nonlocal turn
                if url.endswith('/tools'):
                    return [{"type": "function", "function": {"name": "search_ikea"}}]
                if url.endswith('/search_ikea'):
                    calls.append(payload)
                    return {"ok": True, "result": {"id": "sofa", "widthIn": 57.875, "modelStatus": "placeholder"}}
                messages = payload['messages']
                turn += 1
                if turn == 1:
                    message = {"content": "", "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "search_ikea", "arguments": json.dumps({"description": "grey sofa"})}}]}
                else:
                    self.assertTrue(any(m['role'] == 'tool' for m in messages))
                    message = {"content": "Found the sofa. Confirm the product and sized placeholder?"}
                return {"choices": [{"message": message}]}

            def make():
                return Coordinator(api_key='test', bridge_token='b'*32, seed='s'*32, backend_url='http://127.0.0.1:3102', history=History(path), http=http)

            answer = make().respond('sender', 'chat', 'message_1', 'Find a grey sofa')
            self.assertIn('Confirm', answer)
            self.assertEqual(make().respond('sender', 'chat', 'message_1', 'Find a grey sofa'), answer)
            self.assertEqual(len(calls), 1)
            make().respond('sender', 'chat', 'message_2', 'What dimensions did you find?')
            self.assertEqual(len(calls), 1)
            self.assertNotEqual(make().session_key('sender', 'chat'), make().session_key('other', 'chat'))

    def test_invalid_configuration_stops_before_network_requests(self):
        with tempfile.TemporaryDirectory() as folder:
            history = History(Path(folder) / 'history.sqlite')
            with self.assertRaisesRegex(ValueError, 'ASI1_API_KEY'):
                Coordinator(api_key='', bridge_token='b'*32, seed='s'*32, backend_url='http://localhost', history=history)
            with self.assertRaisesRegex(ValueError, 'HTTPS'):
                Coordinator(api_key='test', bridge_token='b'*32, seed='s'*32, backend_url='http://remote.example', history=history)


if __name__ == '__main__':
    unittest.main()
