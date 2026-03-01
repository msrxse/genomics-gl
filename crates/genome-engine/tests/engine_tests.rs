use genome_engine::parser::{parse_bed, Strand};
use genome_engine::index::GenomeIndex;

const SAMPLE_BED: &[u8] = b"\
# comment line\n\
track name=test\n\
chr22\t10000\t10500\tGENE1\t0\t+\n\
chr22\t20000\t21000\tGENE2\t0\t-\n\
chr22\t30000\t31000\tGENE3\t0\t.\n\
";

// --- Parser tests ---

#[test]
fn test_parse_skips_comments_and_headers() {
    let features = parse_bed(SAMPLE_BED).unwrap();
    assert_eq!(features.len(), 3);
}

#[test]
fn test_parse_first_feature() {
    let features = parse_bed(SAMPLE_BED).unwrap();
    let f = &features[0];
    assert_eq!(f.chrom, "chr22");
    assert_eq!(f.start, 10000);
    assert_eq!(f.end, 10500);
    assert_eq!(f.name, "GENE1");
    assert_eq!(f.strand, Strand::Plus);
}

#[test]
fn test_parse_strand_variants() {
    let features = parse_bed(SAMPLE_BED).unwrap();
    assert_eq!(features[0].strand, Strand::Plus);
    assert_eq!(features[1].strand, Strand::Minus);
    assert_eq!(features[2].strand, Strand::Unknown);
}

#[test]
fn test_parse_bed3_no_name_or_strand() {
    let bed3 = b"chr22\t10000\t10500\n";
    let features = parse_bed(bed3).unwrap();
    assert_eq!(features.len(), 1);
    assert_eq!(features[0].name, ".");
    assert_eq!(features[0].strand, Strand::Unknown);
}

#[test]
fn test_parse_empty_input() {
    let features = parse_bed(b"").unwrap();
    assert_eq!(features.len(), 0);
}

// --- Index / range query tests ---

#[test]
fn test_query_overlapping_range() {
    let features = parse_bed(SAMPLE_BED).unwrap();
    let index = GenomeIndex::build(features);
    let results = index.query(15000, 25000);
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].name, "GENE2");
}

#[test]
fn test_query_full_range_returns_all() {
    let features = parse_bed(SAMPLE_BED).unwrap();
    let index = GenomeIndex::build(features);
    let results = index.query(0, 50000);
    assert_eq!(results.len(), 3);
}

#[test]
fn test_query_empty_range() {
    let features = parse_bed(SAMPLE_BED).unwrap();
    let index = GenomeIndex::build(features);
    let results = index.query(40000, 50000);
    assert_eq!(results.len(), 0);
}

#[test]
fn test_query_results_sorted_by_start() {
    let features = parse_bed(SAMPLE_BED).unwrap();
    let index = GenomeIndex::build(features);
    let results = index.query(0, 50000);
    let starts: Vec<u32> = results.iter().map(|f| f.start).collect();
    assert_eq!(starts, vec![10000, 20000, 30000]);
}

#[test]
fn test_chromosome_length() {
    let features = parse_bed(SAMPLE_BED).unwrap();
    let index = GenomeIndex::build(features);
    assert_eq!(index.chromosome_length(), 31000);
}
