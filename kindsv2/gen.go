//go:generate go run gen.go

package main

import (
	"context"
	"os"

	"github.com/grafana/cog"
)

type codegenTargets struct {
	modulePath string
	outputPath string
	imports    map[string]string
}

func main() {
	targets := []codegenTargets{
		{
			modulePath: "../packages/grafana-schema/src/schema/dashboard/v2alpha0/",
			outputPath: "../packages/grafana-schema/src/schema/dashboard/v2alpha0/dashboard.gen.ts",
		},
	}

	for _, target := range targets {
		codegenPipeline := cog.TypesFromSchema().
			CUEModule(target.modulePath).
			Typescript()

		tsBytes, err := codegenPipeline.Run(context.Background())
		if err != nil {
			panic(err)
		}

		if err := os.WriteFile(target.outputPath, tsBytes, 0644); err != nil {
			panic(err)
		}
	}
}
