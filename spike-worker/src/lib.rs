use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn sum_range(start: u32, end: u32) -> u32 {
    (start..=end).sum()
}