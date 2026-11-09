# Kubernetes («Kubernetes», `kubernetes`, category dev)

The cluster's state in the chat through the local `kubectl` and the user's kubeconfig.

## What it does

- Overview: pods with problems first (CrashLoopBackOff, ImagePullBackOff, OOMKilled, restarts, Pending), ready
  counts, deployments with rollout bars (state computed like `kubectl rollout status`), warning events.
- A pod: facts, containers (state, last termination, memory limit), the pod's events, the last lines of the
  previous container, `kubectl describe` (collapsed), and a cause — from the model, grounded in events and lines
  (quotes that are not there are dropped), or from known reasons without a model.
- Rollout of a deployment: desired/updated/ready/available, `rollout status --watch=false`, its pods and events.
- Restart (`kubectl rollout restart deployment/<name>`) and scale (`kubectl scale deployment/<name> --replicas=N`,
  0–100) run only from the card's confirming button, which shows the exact command. Before running, the context,
  namespace and deployment are re-checked; progress and result go to the notification center
  (`kubernetes-operation`).
- Provides the `log-source` for «Логи сервера» (pod logs by the deployment's selector).

## Phrases

«что с подами в кубере», «какие поды в CrashLoopBackOff», «почему падает под payments», «опиши под api-… в k8s»,
«статус выкатки payments», «события в кубере», «перезапусти деплоймент worker», «отскейль api до 3 реплик».
Pod logs («логи пода api») belong to «Логи сервера».

Near-misses (tested): Docker, logs, monitoring («что с серверами», «какие алерты горят»), dialogue lines
(«реплики персонажа»), «собери под Windows», image scaling, «выкатка в Google Play», CI deploys, «что такое
kubernetes».

## Safety

kubectl runs without a shell (`execFile`), with `--request-timeout` and an explicit `--context`/`--namespace`.
Reads pass an allowlist (get, describe, logs, top pod/node, rollout status/history, config views, version);
exec, attach, port-forward, cp, delete, apply, edit, patch, `--as`, `--token`, `--server`, `--kubeconfig`,
`-f` are refused. The only writes are built from a checked action (DNS-1123 names) by `kubectl.cjs` `write`.

## Setup

kubectl on PATH (or its full path in the settings) and a kubeconfig. Settings: context (default — current) and
namespace (default — the context's, or `default`).

## Verified

Unit (`node tests/kubernetes.cjs`) against a fake kubectl script on PATH: allowlist, no-shell argv, failures
(unreachable, forbidden, timeout, missing), parsing, routing, confirmed writes with re-checked scope, the log
source. UI (`tests/kubernetes-ui.cjs`, screenshots `petya-kubernetes*.png`) clicks the real IPC that runs the fake
kubectl. Not verified against a live cluster.
