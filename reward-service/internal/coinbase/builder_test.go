package coinbase_test

import (
	"fmt"
	"testing"

	"unlucky21/reward/internal/coinbase"
)

// sumOutputs returns the total satoshis across all outputs.
func sumOutputs(outputs []coinbase.CoinbaseOutput) int64 {
	var total int64
	for _, o := range outputs {
		total += o.AmountSats
	}
	return total
}

// TestFull21MinersSubsidyOnly verifies payouts when exactly 21 miners are ranked
// and there are no transaction fees (subsidy only).
func TestFull21MinersSubsidyOnly(t *testing.T) {
	const subsidy int64 = 312_500_000
	const fees int64 = 0
	total := subsidy + fees

	ranked := make([]coinbase.RankedAddress, 21)
	for i := range ranked {
		ranked[i] = coinbase.RankedAddress{Address: fmt.Sprintf("bc1qminer%02d", i+1)}
	}
	finder := "bc1qfinder"

	outputs := coinbase.BuildOutputs(finder, subsidy, fees, ranked)

	// Output count: 21 ranked slots + finder + pool fee = 23
	if len(outputs) != 23 {
		t.Fatalf("expected 23 outputs, got %d", len(outputs))
	}

	// Total must balance exactly
	if got := sumOutputs(outputs); got != total {
		t.Fatalf("total mismatch: got %d, want %d", got, total)
	}

	// Slot 1 (index 0) is the finder bonus
	if outputs[0].Address != finder {
		t.Errorf("slot 1 address: got %q, want %q", outputs[0].Address, finder)
	}
	if outputs[0].AmountSats != coinbase.FinderAmountSats {
		t.Errorf("slot 1 amount: got %d, want %d", outputs[0].AmountSats, coinbase.FinderAmountSats)
	}

	// Pool fee is last output
	poolOut := outputs[len(outputs)-1]
	if poolOut.Address != coinbase.PoolFeeAddress {
		t.Errorf("pool fee address: got %q, want %q", poolOut.Address, coinbase.PoolFeeAddress)
	}

	// All 21 ranked slots must have the same per-slot amount
	poolFeeBase := int64(float64(total) * 0.02)
	remaining := total - coinbase.FinderAmountSats - poolFeeBase
	perSlot := remaining / int64(coinbase.MaxRankedSlots)

	for i := 1; i <= 21; i++ {
		if outputs[i].AmountSats != perSlot {
			t.Errorf("ranked slot %d: got %d, want %d", i, outputs[i].AmountSats, perSlot)
		}
	}

	// Pool fee = base + dust (no unfilled slots)
	dust := remaining - (perSlot * int64(coinbase.MaxRankedSlots))
	wantPoolFee := poolFeeBase + dust
	if poolOut.AmountSats != wantPoolFee {
		t.Errorf("pool fee amount: got %d, want %d", poolOut.AmountSats, wantPoolFee)
	}
}

// TestFull21MinersWithFees verifies totals sum correctly when fees are present.
func TestFull21MinersWithFees(t *testing.T) {
	const subsidy int64 = 312_500_000
	const fees int64 = 10_000_000
	total := subsidy + fees // 322_500_000

	ranked := make([]coinbase.RankedAddress, 21)
	for i := range ranked {
		ranked[i] = coinbase.RankedAddress{Address: fmt.Sprintf("bc1qminer%02d", i+1)}
	}

	outputs := coinbase.BuildOutputs("bc1qfinder", subsidy, fees, ranked)

	if len(outputs) != 23 {
		t.Fatalf("expected 23 outputs, got %d", len(outputs))
	}
	if got := sumOutputs(outputs); got != total {
		t.Fatalf("total mismatch: got %d, want %d", got, total)
	}
}

// TestOnly5MinersRanked verifies that unfilled ranked slots are redirected to the pool fee.
func TestOnly5MinersRanked(t *testing.T) {
	const subsidy int64 = 312_500_000
	const fees int64 = 0
	total := subsidy + fees

	ranked := make([]coinbase.RankedAddress, 5)
	for i := range ranked {
		ranked[i] = coinbase.RankedAddress{Address: fmt.Sprintf("bc1qminer%02d", i+1)}
	}

	outputs := coinbase.BuildOutputs("bc1qfinder", subsidy, fees, ranked)

	// Output count: 5 ranked + finder + pool fee = 7
	if len(outputs) != 7 {
		t.Fatalf("expected 7 outputs, got %d", len(outputs))
	}

	// Total must still balance
	if got := sumOutputs(outputs); got != total {
		t.Fatalf("total mismatch: got %d, want %d", got, total)
	}

	// Pool fee gets base + unfilled slots' worth + dust
	poolFeeBase := int64(float64(total) * 0.02)
	remaining := total - coinbase.FinderAmountSats - poolFeeBase
	perSlot := remaining / int64(coinbase.MaxRankedSlots)
	dust := remaining - (perSlot * int64(coinbase.MaxRankedSlots))
	filledSlots := int64(5)
	unfilledSlots := int64(coinbase.MaxRankedSlots) - filledSlots
	wantPoolFee := poolFeeBase + (perSlot * unfilledSlots) + dust

	poolOut := outputs[len(outputs)-1]
	if poolOut.AmountSats != wantPoolFee {
		t.Errorf("pool fee amount: got %d, want %d", poolOut.AmountSats, wantPoolFee)
	}

	// Each of the 5 ranked slots must have perSlot
	for i := 1; i <= 5; i++ {
		if outputs[i].AmountSats != perSlot {
			t.Errorf("ranked slot %d: got %d, want %d", i, outputs[i].AmountSats, perSlot)
		}
	}
}

// TestZeroMiners verifies that with no ranked miners there are exactly 2 outputs
// and total still balances.
func TestZeroMiners(t *testing.T) {
	const subsidy int64 = 312_500_000
	const fees int64 = 5_000_000
	total := subsidy + fees

	outputs := coinbase.BuildOutputs("bc1qfinder", subsidy, fees, []coinbase.RankedAddress{})

	// Output count: 0 ranked + finder + pool fee = 2
	if len(outputs) != 2 {
		t.Fatalf("expected 2 outputs, got %d", len(outputs))
	}
	if got := sumOutputs(outputs); got != total {
		t.Fatalf("total mismatch: got %d, want %d", got, total)
	}

	// Slot 0 is finder
	if outputs[0].AmountSats != coinbase.FinderAmountSats {
		t.Errorf("finder amount: got %d, want %d", outputs[0].AmountSats, coinbase.FinderAmountSats)
	}
	// Slot 1 is pool fee
	if outputs[1].Address != coinbase.PoolFeeAddress {
		t.Errorf("pool fee address: got %q, want %q", outputs[1].Address, coinbase.PoolFeeAddress)
	}
}

// TestFinderIsAlsoRankOne verifies that when the finder is also rank #1,
// their address appears in both slot 1 (finder bonus) and slot 2 (ranked),
// and the total still balances.
func TestFinderIsAlsoRankOne(t *testing.T) {
	const subsidy int64 = 312_500_000
	const fees int64 = 0
	total := subsidy + fees

	finder := "bc1qfinder"
	ranked := make([]coinbase.RankedAddress, 3)
	ranked[0] = coinbase.RankedAddress{Address: finder} // same as finder
	ranked[1] = coinbase.RankedAddress{Address: "bc1qminer02"}
	ranked[2] = coinbase.RankedAddress{Address: "bc1qminer03"}

	outputs := coinbase.BuildOutputs(finder, subsidy, fees, ranked)

	// Output count: 3 ranked + finder + pool fee = 5
	if len(outputs) != 5 {
		t.Fatalf("expected 5 outputs, got %d", len(outputs))
	}

	// Slot 0 is finder
	if outputs[0].Address != finder {
		t.Errorf("slot 0 address: got %q, want %q", outputs[0].Address, finder)
	}
	if outputs[0].AmountSats != coinbase.FinderAmountSats {
		t.Errorf("slot 0 amount: got %d, want %d", outputs[0].AmountSats, coinbase.FinderAmountSats)
	}

	// Slot 1 (ranked[0]) is also the finder's address
	if outputs[1].Address != finder {
		t.Errorf("slot 1 address: got %q, want %q", outputs[1].Address, finder)
	}

	// Total must balance
	if got := sumOutputs(outputs); got != total {
		t.Fatalf("total mismatch: got %d, want %d", got, total)
	}
}

// TestOutputCounts verifies output count rules for several miner counts.
func TestOutputCounts(t *testing.T) {
	const subsidy int64 = 312_500_000
	const fees int64 = 0

	cases := []struct {
		minerCount int
		wantLen    int
	}{
		{21, 23}, // full house
		{5, 7},   // partial
		{0, 2},   // empty
	}

	for _, tc := range cases {
		ranked := make([]coinbase.RankedAddress, tc.minerCount)
		for i := range ranked {
			ranked[i] = coinbase.RankedAddress{Address: fmt.Sprintf("bc1qminer%02d", i+1)}
		}
		outputs := coinbase.BuildOutputs("bc1qfinder", subsidy, fees, ranked)
		if len(outputs) != tc.wantLen {
			t.Errorf("minerCount=%d: got %d outputs, want %d", tc.minerCount, len(outputs), tc.wantLen)
		}
		// Also verify total balance for each case
		total := subsidy + fees
		if got := sumOutputs(outputs); got != total {
			t.Errorf("minerCount=%d: total mismatch: got %d, want %d", tc.minerCount, got, total)
		}
	}
}
