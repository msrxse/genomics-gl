use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feature {
    pub chrom: String,
    pub start: u32,
    pub end: u32,
    pub name: String,
    pub strand: Strand,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Strand {
    Plus,
    Minus,
    Unknown,
}

/// Parse a BED file (bytes) into a list of features.
/// Ignores comment lines and the header line if present.
pub fn parse_bed(data: &[u8]) -> Result<Vec<Feature>, String> {
    let text = std::str::from_utf8(data).map_err(|e| e.to_string())?;
    let mut features = Vec::new();

    for line in text.lines() {
        if line.starts_with('#') || line.starts_with("track") || line.starts_with("browser") {
            continue;
        }
        if line.trim().is_empty() {
            continue;
        }

        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() < 3 {
            continue;
        }

        let chrom = cols[0].to_string();
        let start = cols[1].parse::<u32>().map_err(|e| e.to_string())?;
        let end = cols[2].parse::<u32>().map_err(|e| e.to_string())?;
        let name = if cols.len() > 3 { cols[3].to_string() } else { ".".to_string() };
        let strand = if cols.len() > 5 {
            match cols[5] {
                "+" => Strand::Plus,
                "-" => Strand::Minus,
                _ => Strand::Unknown,
            }
        } else {
            Strand::Unknown
        };

        features.push(Feature { chrom, start, end, name, strand });
    }

    Ok(features)
}