export interface RuntimeFixtureCase {
  readonly name: string;
  readonly markdown: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

export const fixtures: Readonly<Record<string, string>>;
export const representativeAgentResponse: string;
export const parityCases: readonly RuntimeFixtureCase[];
