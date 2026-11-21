import unittest

from brainstorm.parse_board import parse_board


class ParseBoardTest(unittest.TestCase):
    def test_fenced_json(self):
        text = """Here is the board:
```json
{"title":"Night market","thesis":"Sell the hour, not the place.","ideas":[{"id":"a","title":"Hour lease","pitch":"Rent a stall by the hour.","how":"Hosts post a window.","firstStep":"Call two markets.","risk":"No-shows.","score":8,"tags":["ops"]}],"killed":[{"title":"App for apps","why":"No mechanism."}],"questions":["Who carries insurance?"],"next":"Interview two hosts."}
```"""
        board = parse_board(text)
        assert board is not None
        self.assertEqual(board["title"], "Night market")
        self.assertEqual(board["ideas"][0]["firstStep"], "Call two markets.")
        self.assertEqual(board["ideas"][0]["score"], 8)
        self.assertEqual(board["killed"][0]["why"], "No mechanism.")

    def test_rejects_prose(self):
        self.assertIsNone(parse_board("No structure here, just a paragraph."))

    def test_clamps_score(self):
        board = parse_board('{"ideas":[{"title":"Only","score":99}]}')
        assert board is not None
        self.assertEqual(board["ideas"][0]["score"], 10)


if __name__ == "__main__":
    unittest.main()
