# ZK Tactical Match Circuit - Quick Reference

## Compile
```bash
nargo compile
```

## Test
```bash
nargo test
```

## Generate Proof
1. Create `Prover.toml` with inputs
2. Run `nargo prove`

## Verify Proof
```bash
nargo verify
```

## Hash Function
Using `pedersen_hash` - ZK-friendly hash available in Noir stdlib.

If you get errors, try:
- `std::hash::pedersen_hash` 
- Or check available functions: `nargo lsp`
