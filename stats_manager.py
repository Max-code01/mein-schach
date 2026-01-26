import json
import datetime
import math

class SchachLaborPro:
    def __init__(self, spieler_name):
        self.spieler = spieler_name
        self.partie_id = f"GAME-{datetime.datetime.now().strftime('%Y%m%d-%H%M')}"
        self.zuege = []
        self.material_wert = 0
        self.fehler_count = 0
        self.aggressivitaet = 0

    def analysiere_zug(self, von, nach, figur, wert, ist_schlagzug=False):
        """Analysiert jeden einzelnen Zug im Detail."""
        # Zeitstempel für den Zug
        jetzt = datetime.datetime.now()
        
        # Aggressivität berechnen (Schlagen gibt extra Punkte)
        if ist_schlagzug:
            self.aggressivitaet += 10
            self.material_wert += wert
        
        # Positions-Check (Zentrumskontrolle)
        zentrums_felder = ["d4", "d5", "e4", "e5"]
        zentrum_bonus = 5 if nach in zentrums_felder else 0
        
        zug_daten = {
            "nr": len(self.zuege) + 1,
            "zug": f"{von} -> {nach}",
            "figur": figur,
            "wert": wert + zentrum_bonus,
            "typ": "Angriff" if ist_schlagzug else "Normal",
            "zeit": jetzt.strftime("%H:%M:%S")
        }
        self.zuege.append(zug_daten)

    def berechne_end_statistik(self):
        """Erstellt eine hochkomplexe Auswertung des gesamten Spiels."""
        anzahl = len(self.zuege)
        if anzahl == 0: return {"Fehler": "Keine Daten"}

        # Elo-Berechnung (Simuliert)
        basis_elo = 1000
        genauigkeit = min(100, (anzahl * 2) + (self.aggressivitaet * 0.5))
        finale_elo = basis_elo + (anzahl * 10) + self.aggressivitaet

        return {
            "Partie-Zusammenfassung": {
                "ID": self.partie_id,
                "Spieler": self.spieler,
                "Datum": str(datetime.datetime.now().date()),
                "Gesamte Züge": anzahl
            },
            "Performance": {
                "Genauigkeit": f"{round(genauigkeit, 1)}%",
                "Aggressivitäts-Score": self.aggressivitaet,
                "Geschätzte Elo": int(finale_elo),
                "Rang": "Großmeister" if finale_elo > 2000 else "Fortgeschritten"
            },
            "Highlights": {
                "Meistbewegte Figur": max(set([z['figur'] for z in self.zuege]), key=[z['figur'] for z in self.zuege].count) if anzahl > 0 else "N/A",
                "Gewonnenes Material": self.material_wert
            }
        }

# --- AUTOMATISCHER TEST-LAUF ---
if __name__ == "__main__":
    # Hier simulieren wir ein echtes Spiel für dein Python-Labor
    mein_spiel = SchachLaborPro("Max")
    
    # Simuliere Züge: von, nach, figur, wert, ist_schlagzug
    mein_spiel.analysiere_zug("e2", "e4", "Bauer", 100, False)
    mein_spiel.analysiere_zug("g1", "f3", "Springer", 320, False)
    mein_spiel.analysiere_zug("f3", "e5", "Springer", 320, True) # Der Springer schlägt!
    
    # Ergebnis ausgeben
    ergebnis = mein_spiel.berechne_end_statistik()
    print(f"--- ANALYSE FÜR {ergebnis['Partie-Zusammenfassung']['Spieler']} ---")
    print(json.dumps(ergebnis, indent=4, ensure_ascii=False))
