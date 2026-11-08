export function cancelSupersededDeploys(input: {
  repository: string;
  headSha: string;
  token: string;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}): Promise<number>;
