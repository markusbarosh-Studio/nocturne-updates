# Nocturne – Updates

Feste Ablage für die Updates von **Markus Barosh Nocturne**. Die App prüft hier automatisch, ob es eine neue Version gibt.

- **Release „aktualisierungen“** – enthält die Update-Pakete, die Update-Listen (`aktualisierung.json`, `aktualisierung-e.json`) und ihre Signaturen (`.sig`). **Nicht löschen und nicht umbenennen** – die installierten Apps lesen genau diese Adresse.
- **Signatur** – jede Liste ist mit dem Studio-Schlüssel signiert. Die App nimmt nur signierte Listen an. Der private Schlüssel liegt ausschließlich als Secret `NOCTURNE_SCHLUESSEL` in diesem Repository (Settings › Secrets and variables › Actions) und in Markus' Sicherung – nie im Code.
- **Eigentümer-Ausgabe** – ihre Liste und Pakete sind zusätzlich verschlüsselt und hier unlesbar.
- **Freigabe** – eine neue Liste wird erst signiert, wenn eine Freigabe-Datei in `freigabe/` ankommt. Dann startet „Updates signieren“ (Reiter *Actions*), prüft alles und veröffentlicht. Der letzte Lauf steht als `signier-bericht.txt` im Release.

Öffentlicher Schlüssel (steht auch in der App): `werkzeug/oeffentlicher-schluessel.txt`.
