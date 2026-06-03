package coinbase

import "fmt"

const (
	FinderAmountSats int64   = 50_000_000
	PoolFeePercent   float64 = 0.02
	MaxRankedSlots   int     = 21
	// Replace with real pool fee address before mainnet launch
	PoolFeeAddress = "bc1qPOOL_FEE_ADDRESS_PLACEHOLDER"
)

// RankedAddress holds the Bitcoin address of a ranked miner.
type RankedAddress struct {
	Address string
}

// CoinbaseOutput represents a single output in the coinbase transaction.
type CoinbaseOutput struct {
	Address    string
	AmountSats int64
}

// BuildOutputs constructs the ordered coinbase output list.
//
// Slot layout:
//   - Index 0        : finder bonus (fixed FinderAmountSats = 50M sats)
//   - Index 1..N     : top-N ranked miners (N = min(len(ranked), MaxRankedSlots))
//   - Index N+1      : pool fee address (exactly 2% of total + unfilled-slot sats + dust)
//
// All output amounts sum to exactly subsidySats + feesSats.
// Panics if the invariant is violated (belt-and-suspenders for a financial function).
func BuildOutputs(
	minerAddress string,
	subsidySats, feesSats int64,
	ranked []RankedAddress,
) []CoinbaseOutput {
	total := subsidySats + feesSats

	// 2% pool fee — float only for the percentage calculation; result is int64.
	poolFeeBase := int64(float64(total) * PoolFeePercent)

	remaining := total - FinderAmountSats - poolFeeBase

	perSlot := remaining / int64(MaxRankedSlots)
	dust := remaining - (perSlot * int64(MaxRankedSlots))

	// Cap ranked miners at MaxRankedSlots.
	filledSlots := len(ranked)
	if filledSlots > MaxRankedSlots {
		filledSlots = MaxRankedSlots
	}

	// Unfilled slot amounts roll into the pool fee.
	unfilledSlots := int64(MaxRankedSlots - filledSlots)
	poolFeeOut := poolFeeBase + (perSlot * unfilledSlots) + dust

	// Build output slice: finder + filledSlots ranked + pool fee.
	outputs := make([]CoinbaseOutput, 0, filledSlots+2)

	// Slot 0: finder bonus
	outputs = append(outputs, CoinbaseOutput{
		Address:    minerAddress,
		AmountSats: FinderAmountSats,
	})

	// Slots 1..filledSlots: ranked miners
	for i := 0; i < filledSlots; i++ {
		outputs = append(outputs, CoinbaseOutput{
			Address:    ranked[i].Address,
			AmountSats: perSlot,
		})
	}

	// Last slot: pool fee
	outputs = append(outputs, CoinbaseOutput{
		Address:    PoolFeeAddress,
		AmountSats: poolFeeOut,
	})

	// Invariant check: outputs must sum to total exactly.
	var got int64
	for _, o := range outputs {
		got += o.AmountSats
	}
	if got != total {
		panic(fmt.Sprintf(
			"coinbase: output sum invariant violated: got %d, want %d (subsidy=%d fees=%d)",
			got, total, subsidySats, feesSats,
		))
	}

	return outputs
}
