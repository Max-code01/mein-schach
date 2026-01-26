// logic.rs - Das vollständige Hochleistungs-Modul für dein Schachspiel
// Ersetze den alten Inhalt komplett durch diesen Code.

/// Gibt den mathematischen Wert einer einzelnen Figur zurück.
/// Positive Werte für Weiß, negative Werte für Schwarz.
pub fn get_piece_value(piece: char) -> i32 {
    match piece {
        // Weiß (Großbuchstaben)
        'P' => 100,   // Bauer
        'N' => 320,   // Springer
        'B' => 330,   // Läufer
        'R' => 500,   // Turm
        'Q' => 900,   // Dame
        'K' => 20000, // König

        // Schwarz (Kleinbuchstaben)
        'p' => -100,  // Bauer
        'n' => -320,  // Springer
        'b' => -330,  // Läufer
        'r' => -500,  // Turm
        'q' => -900,  // Dame
        'k' => -20000,// König

        // Leeres Feld oder unbekannt
        _ => 0,
    }
}

/// Bewertet eine komplette Spielfeld-Stellung (FEN-String).
/// Ein positives Ergebnis bedeutet Vorteil für Weiß, ein negatives für Schwarz.
pub fn evaluate_position(board_fen: &str) -> i32 {
    let mut total_score = 0;
    
    for c in board_fen.chars() {
        total_score += get_piece_value(c);
    }
    
    total_score
}

/// Prüft, ob ein Materialvorteil besteht.
pub fn has_material_advantage(score: i32) -> &'static str {
    if score > 0 {
        "Weiß ist im Vorteil"
    } else if score < 0 {
        "Schwarz ist im Vorteil"
    } else {
        "Stellung ist ausgeglichen"
    }
}
