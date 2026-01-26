// logic.rs - Deine neue Hochgeschwindigkeitssprache
pub fn get_piece_value(piece: char) -> i32 {
    match piece {
        'P' | 'p' => 10,  // Bauer
        'N' | 'n' => 30,  // Springer
        'B' | 'b' => 30,  // Läufer
        'R' | 'r' => 50,  // Turm
        'Q' | 'q' => 90,  // Dame
        'K' | 'k' => 900, // König
        _ => 0,
    }
}
