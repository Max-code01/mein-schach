// logic.rs - Das Profi-Gehirn für dein Schachspiel
use wasm_bindgen::prelude::*;

// 1. MATERIAL-WERTE (Exakt wie im Worker abgestimmt)
#[wasm_bindgen]
pub fn get_piece_value(piece: char) -> i32 {
    match piece {
        'P' => 100,   'p' => -100,  // Bauer
        'N' => 320,   'n' => -320,  // Springer
        'B' => 330,   'b' => -330,  // Läufer
        'R' => 500,   'r' => -500,  // Turm
        'Q' => 900,   'q' => -900,  // Dame
        'K' => 20000, 'k' => -20000, // König
        _ => 0,
    }
}

// 2. BRETT-BEWERTUNG (Für Hochgeschwindigkeits-KI)
#[wasm_bindgen]
pub fn evaluate_board(board_string: &str) -> i32 {
    let mut total_score = 0;
    
    // Geht jedes Zeichen des Brett-Strings durch und summiert die Werte
    for c in board_string.chars() {
        total_score += get_piece_value(c);
    }
    
    total_score
}

// 3. ZENTRUMS-ANALYSE (Zusatz-Bonus für bessere Züge)
#[wasm_bindgen]
pub fn get_position_bonus(piece: char, row: i32, col: i32) -> i32 {
    // Springer und Bauern in der Mitte (Reihe 3-4, Spalte 3-4) erhalten Bonus
    if (piece == 'N' || piece == 'n' || piece == 'P' || piece == 'p') 
        && row >= 3 && row <= 4 && col >= 3 && col <= 4 {
        return if piece.is_uppercase() { 15 } else { -15 };
    }
    0
}
