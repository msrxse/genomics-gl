use std::collections::HashMap;
use crate::parser::Feature;

// UCSC binning constants — 5-level hierarchy covering up to 512 Mb
const OFFSETS: [u32; 5] = [585, 73, 9, 1, 0];
const SHIFTS: [u32; 5] = [29, 26, 23, 20, 17];

/// Returns the bin number for a feature spanning [start, end).
fn bin_for_range(start: u32, end: u32) -> u32 {
    let end_minus1 = end.saturating_sub(1);
    for i in (0..5).rev() {
        if (start >> SHIFTS[i]) == (end_minus1 >> SHIFTS[i]) {
            return OFFSETS[i] + (start >> SHIFTS[i]);
        }
    }
    // Fallback: largest bin (level 0)
    OFFSETS[0]
}

/// UCSC binning index for O(log n) range queries.
pub struct GenomeIndex {
    features: Vec<Feature>,
    bins: HashMap<u32, Vec<usize>>, // bin number → indices into features
    max_end: u32,
}

impl GenomeIndex {
    pub fn build(features: Vec<Feature>) -> Self {
        let mut bins: HashMap<u32, Vec<usize>> = HashMap::new();
        let mut max_end = 0u32;

        for (i, feature) in features.iter().enumerate() {
            let bin = bin_for_range(feature.start, feature.end);
            bins.entry(bin).or_default().push(i);
            if feature.end > max_end {
                max_end = feature.end;
            }
        }

        Self { features, bins, max_end }
    }

    pub fn query(&self, start: u32, end: u32) -> Vec<&Feature> {
        let mut indices = std::collections::HashSet::new();

        for i in 0..5 {
            let bin_start = OFFSETS[i] + (start >> SHIFTS[i]);
            let bin_end = OFFSETS[i] + ((end.saturating_sub(1)) >> SHIFTS[i]);
            for bin in bin_start..=bin_end {
                if let Some(idxs) = self.bins.get(&bin) {
                    for &idx in idxs {
                        indices.insert(idx);
                    }
                }
            }
        }

        let mut results: Vec<&Feature> = indices
            .into_iter()
            .map(|i| &self.features[i])
            .filter(|f| f.start < end && f.end > start)
            .collect();

        results.sort_by_key(|f| f.start);
        results
    }

    pub fn chromosome_length(&self) -> u32 {
        self.max_end
    }
}