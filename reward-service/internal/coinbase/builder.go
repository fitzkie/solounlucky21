package coinbase

import "fmt"

const (
	// Unlucky21 reward model (v2):
	// - Finder:   2.1% of total block reward (scales with fees, not a fixed lottery prize)
	// - Pool fee: 2.1% of total block reward
	// - Top 21:  95.8% split equally — the leaderboard IS the prize
	//
	// If the finder is also in the top 21 they collect both slots.
	// At 3.125 BTC subsidy: finder ~0.066 BTC, each ranked slot ~0.143 BTC.
	FinderPercent  float64 = 0.021
	PoolFeePercent float64 = 0.021
	MaxRankedSlots int     = 21

	// Pool fee address — mainnet Legacy P2PKH (1DR9p...)
	PoolFeeAddress = "1DR9pDLvFVnaJBRT5M4hUJLiuCQ7YE8D7b"
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
//   - Index 0      : finder bonus (2.1% of total — scales with block reward)
//   - Index 1..N   : top-N ranked miners (N = min(len(ranked), MaxRankedSlots))
//   - Index N+1    : pool fee address (2.1% of total + unfilled slots + dust)
//
// All output amounts sum to exactly subsidySats + feesSats.
// Panics if the invariant is violated (belt-and-suspenders for a financial function).
func BuildOutputs(
	minerAddress string,
	subsidySats, feesSats int64,
	ranked []RankedAddress,
) []CoinbaseOutput {
	total := subsidySats + feesSats

	// Finder and pool fee are each 2.1% of the total block reward.
	finderAmount := int64(float64(total) * FinderPercent)
	poolFeeBase  := int64(float64(total) * PoolFeePercent)

	remaining := total - finderAmount - poolFeeBase

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

	// Slot 0: finder bonus (2.1% of block reward)
	outputs = append(outputs, CoinbaseOutput{
		Address:    minerAddress,
		AmountSats: finderAmount,
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
