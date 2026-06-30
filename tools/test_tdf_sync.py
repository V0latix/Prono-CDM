"""Check minimal et sans dependance de la logique pure de tdf_sync.

Lance : python tools/test_tdf_sync.py
N'importe ni procyclingstats ni requests (la synchro reseau n'est pas testable hors live PCS).
"""

from tdf_sync import slug


def test_slug():
    assert slug("rider/tadej-pogacar") == "tadej-pogacar"
    assert slug("rider/tadej-pogacar/") == "tadej-pogacar"
    assert slug("https://www.procyclingstats.com/rider/remco-evenepoel") == "remco-evenepoel"
    assert slug("") == ""
    assert slug(None) == ""


if __name__ == "__main__":
    test_slug()
    print("test_tdf_sync OK")
