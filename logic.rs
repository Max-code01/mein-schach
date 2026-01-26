// logic.rs - Erweiterte Logik für Stellungsbewertung
// Diese Datei arbeitet unabhängig von deinem restlichen Code.

pub struct MoveRating {
    pub score: i32,
}

// 1. Erweiterte Werte für alle Figuren
pub fn get_piece_value(piece: char) -> i32 {
    match piece {
        'P' => 100,  // Weißer Bauer
        'p' => -100, // Schwarzer Bauer
        'N' => 320,  // Weißer Springer
        'n' => -320, // Schwarzer Springer
        'B' => 330,  // Weißer Läufer
        'b' => -330, // Schwarzer Läufer
        'R' => 500,  // Weißer Turm
        'r' => -500, // Schwarzer Turm
        'Q' => 900,  // Weiße Dame
        'q' => -900, // Schwarze Dame
        'K' => 20000,// Weißer König
        'k' => -20000,// Schwarzer König
        _ => 0,
    }
}

// 2. Funktion zur Bewertung eines ganzen Brettes
// Diese Funktion berechnet, wer aktuell vorne liegt.
pub fn evaluate_board(board_fen: &str) -> i32 {
    let mut total_score = 0;
    for c in board_fen.chars() {
        total_score += get_piece_value(c);
    }
    total_score
}

// 3. Sicherheits-Check für Züge
pub fn is_move_safe(start_pos: i32, end_pos: i32) -> bool {
    // Hier könnte später komplizierte Logik stehen
    true
}
