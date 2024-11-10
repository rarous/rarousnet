import { parseArgs } from "jsr:@std/cli/parse-args";

async function deleteDeployment(endpoint, deploymentId, token) {
  const params = new URLSearchParams({ force: true });
  const resp = await fetch(`${endpoint}/${deploymentId}?${params}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  return resp.json();
}

async function getDeployments(endpoint, env, page, token) {
  const params = new URLSearchParams({ page, env });
  const resp = await fetch(`${endpoint}?${params}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  return resp.json();
}

async function* getAllDeployments(endpoint, env, token) {
  const { result_info } = await getDeployments(endpoint, env, 1, token);
  // Iterate deployments from the end, because total_pages shrinks in time
  for (let page = result_info.total_pages; page > 0; page--) {
    console.log(`Loading deployments page ${page}`);
    const { success, errors, result } = await getDeployments(endpoint, env, page, token);
    if (success) yield* result;
    else console.error(errors);
  }
}

async function main({ accountId, projectName, token }) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`;
  const day = 24 * 60 * 60 * 1000;
  const threshold = new Date(Date.now() - 2 * day).toISOString();
  console.log("Cleaning Preview deployments");
  for await (const { id, created_on } of getAllDeployments(endpoint, "preview", token)) {
    if (created_on > threshold) continue;
    const { success, errors } = await deleteDeployment(endpoint, id, token);
    console.log({ id, created_on, success, errors });
  }
  console.log("Cleaning Production deployments");
  for await (const { id, created_on } of getAllDeployments(endpoint, "production", token)) {
    if (created_on > threshold) continue;
    const { success, errors } = await deleteDeployment(endpoint, id, token);
    console.log({ id, created_on, success, errors });
  }
}

await main(parseArgs(Deno.args));

// deno run --allow-net=api.cloudflare.com cleanup-deployments.js --projectName=rarousnet --accountId=$(op read "op://rarous.net/Cloudflare Cleaner/username") --token=$(op read "op://rarous.net/Cloudflare Cleaner/credential")
