# Nocturne – Updates

Feste Ablage für die Updates von **Markus Barosh Nocturne**. Die App prüft hier automatisch, ob es eine neue Version gibt.

- **Release „aktualisierungen“** – enthält die Update-Pakete, die Update-Listen (`aktualisierung.json`, `aktualisierung-e.json`) und ihre Signaturen (`.sig`). **Nicht löschen und nicht umbenennen** – die installierten Apps lesen genau diese Adresse.
- **Signatur** – jede Liste ist mit dem Studio-Schlüssel signiert; die App nimmt nur signierte Listen an. Der private Schlüssel liegt nie im Code.
- **Eigentümer-Ausgabe** – ihre Liste und Pakete sind zusätzlich verschlüsselt und hier unlesbar.
- **Veröffentlichen** – nur auf Markus' Knopfdruck im privaten Hauptprojekt (Actions › „Run workflow“). Dort wird gebaut, geprüft, signiert und hierher hochgeladen.

Öffentlicher Schlüssel (steht auch in der App): `werkzeug/oeffentlicher-schluessel.txt`.
