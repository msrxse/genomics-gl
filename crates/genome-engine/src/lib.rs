pub mod index;
pub mod parser;
mod renderer;

use std::cell::RefCell;
use wasm_bindgen::prelude::*;
use index::GenomeIndex;

thread_local! {
    static INDEX: RefCell<Option<GenomeIndex>> = RefCell::new(None);
}

#[wasm_bindgen]
pub fn load_bed(data: &[u8]) -> Result<(), JsValue> {
    let features = parser::parse_bed(data).map_err(|e| JsValue::from_str(&e))?;
    let genome_index = GenomeIndex::build(features);
    INDEX.with(|idx| *idx.borrow_mut() = Some(genome_index));
    Ok(())
}

#[wasm_bindgen]
pub fn get_features_in_range(start: u32, end: u32) -> JsValue {
    INDEX.with(|idx| {
        let borrowed = idx.borrow();
        match borrowed.as_ref() {
            None => JsValue::NULL,
            Some(index) => {
                let features = index.query(start, end);
                serde_wasm_bindgen::to_value(&features).unwrap_or(JsValue::NULL)
            }
        }
    })
}

#[wasm_bindgen]
pub fn chromosome_length() -> u32 {
    INDEX.with(|idx| {
        idx.borrow()
            .as_ref()
            .map(|index| index.chromosome_length())
            .unwrap_or(0)
    })
}
