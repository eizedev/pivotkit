---
title: Kubernetes
description: Run pivotkit-server with the REST service and the MCP server on Kubernetes - how data files reach /data (a CronJob on a ReadWriteMany volume, or a sidecar), memory and workers, volumes, Service, Ingress, NetworkPolicy, sign-in with Authentik, and a complete example manifest.
---

# Kubernetes

This page runs the [container image](../reference/container.md) on Kubernetes: one Deployment
serves the [REST service](../reference/rest.md) at `/api/v1` and the [MCP server](../reference/mcp.md)
at `/mcp` on port 3333, from one configuration file. The example manifest
[docker/kubernetes.example.yaml](https://github.com/eizedev/pivotkit/blob/main/docker/kubernetes.example.yaml)
holds every part shown below; the sections explain each one.

## Set it up { #setup }

1. Download the manifest:

    ```bash
    curl -fsSLO https://raw.githubusercontent.com/eizedev/pivotkit/main/docker/kubernetes.example.yaml
    ```

2. Edit your copy: `<version>` (a release of pivotkit-server, or the image's digest;
   [which tag](upgrading.md#update-image)), `reports.example.com` (your host name), the CronJob's
   `SOURCE_URL` and the addresses of its host in the NetworkPolicy `pivotkit-fetch-data`, and the
   namespace of your ingress controller in the NetworkPolicy `pivotkit`. Where needed also: the
   Ingress's `ingressClassName` (when the cluster has no default class), the certificate's Secret
   `pivotkit-tls` (made by hand or by a tool such as cert-manager), and the `storageClassName` of
   `pivotkit-data` (when the default class offers no ReadWriteMany).
3. Create the namespace and the token, then apply the manifest and fetch the data once:

    ```bash
    kubectl create namespace pivotkit
    openssl rand -base64 32 | tr -d '/+=\n' > reports.token   # about 42 characters
    kubectl -n pivotkit create secret generic pivotkit-tokens --from-file=reports=./reports.token
    kubectl apply -f kubernetes.example.yaml
    kubectl -n pivotkit create job --from=cronjob/pivotkit-fetch-data pivotkit-fetch-data-first
    kubectl -n pivotkit rollout status deployment/pivotkit
    ```

    `apply` warns once that the namespace has no `last-applied-configuration` annotation and adds
    it. A token has at least 32 characters. Keep it out of the manifest and out of environment
    variables (`kubectl describe` shows those).

## Check it { #check }

From your machine, through a port forward (it sends `Host: localhost:3333`, which the server
answers):

```bash
kubectl -n pivotkit port-forward svc/pivotkit 3333:3333 &
curl -s http://localhost:3333/readyz
curl -s -H "Authorization: Bearer $(cat reports.token)" http://localhost:3333/api/v1/sources
kill %1   # ends the port forward
```

`/readyz` answers `{"ok":true,...}`, and `/api/v1/sources` lists `sales`; a call to the source
answers 404 `FILE_NOT_AVAILABLE` until the job has written the file
(`kubectl -n pivotkit logs job/pivotkit-fetch-data-first`). Then the same through the Ingress:

```bash
curl -s -H "Authorization: Bearer $(cat reports.token)" https://reports.example.com/api/v1/sources
```

Give the token to its users the way you hand out secrets, then delete the local file
(`rm reports.token`).

## Configuration and token { #config }

The configuration is a ConfigMap mounted at `/config`, where the image reads
`/config/pivotkit.json`. Its keys are those of [the REST service](../reference/rest.md#running) and
[the MCP server](../reference/mcp.md#configuration):

```yaml
--8<-- "kubernetes.example.yaml:config"
```

- `http.publicUrl` is the address clients use; the server answers that host name and the localhost
  names (and the names in `http.allowHosts`). Any other `Host`, such as the pod's IP address, gets
  403. Clients inside the cluster use the public address too, through the ingress controller; see
  [clients inside the cluster](#in-cluster) for the other way.
- `http.trustProxy` makes the server read the client's address from the last entry of
  `X-Forwarded-For`, which the ingress controller writes (the log names it `clientAddress`; the log
  is JSON lines for the cluster's log agent, [operations and logs](../reference/operations.md#kubernetes)). Only the controller may reach the pod then
  (the [NetworkPolicy](#networkpolicy) below), or a client could name any address.
- The token comes from the Secret `pivotkit-tokens`, mounted as a directory at
  `/run/secrets/pivotkit`. The server reads a token file on every request: after
  `kubectl create secret ... --dry-run=client -o yaml | kubectl apply -f -` with a new token, the
  kubelet updates the file after a short delay (its sync period and cache) and the new token works
  without a restart. That holds only without `subPath`: a file mounted with `subPath` never changes.
- With [OAuth](#oauth) instead of tokens, remove the `tokens` volume and its mount.
- A changed ConfigMap is not read again: restart the Deployment
  (`kubectl -n pivotkit rollout restart deployment/pivotkit`).

## The Deployment { #deployment }

```yaml
--8<-- "kubernetes.example.yaml:deployment"
```

What each setting is for:

| Setting | Why |
| --- | --- |
| `replicas: 1`, `strategy: Recreate` | One server process per output directory (`/out`): the count of its files and their clean-up are kept within one process ([output directory](../reference/rest.md#auth)). A rolling update would run two pods on it for a while |
| `enableServiceLinks: false` | With it on, Kubernetes sets `PIVOTKIT_PORT=tcp://<address>:3333` in every pod of the namespace for the Service named `pivotkit`, and the server stops with `PIVOTKIT_PORT is "tcp://...", which Kubernetes sets for a Service named pivotkit`. `PIVOTKIT_PORT` is set to 3333 as well |
| `automountServiceAccountToken: false` | pivotkit calls no Kubernetes API |
| User and group 10001, `fsGroup: 10001` | The image's user; `fsGroup` makes the volumes and the Secret's files (mode 0440) readable and `/out` writable for it. `fsGroupChangePolicy: OnRootMismatch` changes the owner of a volume's files only when its top directory does not match yet, so a start does not walk a large volume every time |
| The namespace's label `pod-security.kubernetes.io/enforce: restricted` | Kubernetes refuses any pod in the namespace that does not meet the restricted Pod Security Standard (non-root, no privilege escalation, no capabilities, a seccomp profile); every pod of the example meets it |
| `readOnlyRootFilesystem`, no capabilities, `RuntimeDefault` seccomp | As `--read-only --cap-drop ALL` in [Run it](../reference/container.md#run); `/tmp` is an `emptyDir` |
| Probes with `Host: localhost` | A probe sends the pod's IP address as `Host`, which the server refuses. `/healthz` answers while the process runs (liveness, startup); `/readyz` answers 200 only when the server can take work: the OAuth issuer loaded, the workers up, `/out` writable ([Health](../reference/container.md#health)) |
| `terminationGracePeriodSeconds: 30` | After SIGTERM the server takes no new connection and lets running reports finish for up to 25 seconds (`http.graceMs`) |

A source whose file is missing does not stop the server or `/readyz`: a call to that source answers
404 `FILE_NOT_AVAILABLE` until the file is there. `pivotkit-server check-config` reports such a file as
`NOT FOUND` and exits with 1.

The limits on callers (`rest.rateLimit`, `mcp.rateLimit`, the refused tokens per address) are counted
in the memory of one process. With more than one replica, each counts on its own, and each needs an
output directory of its own (a StatefulSet with a volume claim template, or an `emptyDir` when the
reports need not survive a restart). The MCP endpoint keeps no sessions, so any replica can answer
any request. A [download link](../reference/delivery.md) only works on the replica that wrote its
report unless the replicas share one output directory (a ReadWriteMany volume) and one link key: put
`output.downloads.key` in a Secret and pass it as an environment variable
(`"key": { "env": "PIVOTKIT_DOWNLOAD_KEY" }`). With one replica, set the key all the same, so links
survive a restart.

## Memory and workers { #sizing }

Reports over a file are computed in a pool of worker threads (`compute.*` in
[the configuration](../reference/mcp.md#configuration)):

| Key | Default | What it does |
| --- | --- | --- |
| `compute.workers` | 2 (at most 16) | Reports computed at once |
| `compute.memoryMb` | 1024 | The JavaScript heap a worker may use; a report that needs more fails with `LIMIT_EXCEEDED`, and the worker is replaced |
| `compute.timeMs` | 30000 | The longest a report may compute (`TIMEOUT`) |
| `compute.queueMs` | 10000 | How long a call waits for a free worker before `BUSY` |
| `limits.fileBytes` | 50 MB | The largest file the server reads |

`compute.memoryMb` bounds a worker's JavaScript heap (old generation; the young generation adds up
to 64 MB), not all of its memory: the bytes of the file it reads and the encoded columns (typed
arrays, up to 12 bytes per row and column) lie outside it. Each worker also keeps the last four data
sets it read, so its memory stays up after a report instead of going back down, and the encoded
columns of all four count. As a starting point for the container's memory limit:

```text
memory limit  =  main process  +  compute.workers x (compute.memoryMb + 64 MB + limits.fileBytes)
```

With the defaults that is about 150 MB + 2 x (1024 + 64 + 50) MB, about 2.4 GB: the example sets
2560Mi. Large files with many columns need more than this for the encoded columns kept; watch the
pod's memory with your own data. A limit below the sum turns a report that would fail alone with `LIMIT_EXCEEDED` into an OOM
kill of the whole pod, with every report running in it. For a smaller pod lower `compute.memoryMb`
(with 512 and 2 workers, about 1.4 GB) or the workers, not the limit alone.

For an idea of real use (measured once with Node 26 on macOS, not with the image; take it as a rough
order and check your own data with `kubectl top pod`): over a CSV file of 30 MB with 700,000 rows and
6 columns, the process used about 100 MB without work and about 470 MB more for each worker that had
computed a report over it.

A report runs on one worker thread: give the pod about one CPU per worker that should compute at the
same time. The example requests half a CPU and sets no CPU limit.

## Data in /data { #data }

The server reads its sources from files; on Kubernetes something has to put them there. The server
notices a new file by its identity, size and time, so replace a file with a new one: write it under
another name in the same directory and rename it (`mv`), or flip a symbolic link to a new directory.
Never write into the file the server reads: a read in between gets half of it. The files must be
readable by the user 10001.

### A CronJob on a ReadWriteMany volume { #cronjob }

A job fetches the data on a schedule and writes it to a volume that the pivotkit pods mount
read-only. The volume must allow ReadWriteMany (NFS, CephFS, a cloud provider's file storage), since
the job's pod and the server's pods may run on different nodes; set `storageClassName` to such a class
where the cluster's default class is not one.

```yaml
--8<-- "kubernetes.example.yaml:volumes"
```

```yaml
--8<-- "kubernetes.example.yaml:cronjob"
```

The job takes only HTTPS (`--proto '=https'`, and no redirects: a redirect would give an empty
file), stops at 50 MB (`limits.fileBytes`, the largest file the server reads) and replaces the data
only after an answer 200 with content; on any failure the old file stays and the temporary one is
removed. When the data's host needs a credential, put the header line into the Secret
`pivotkit-source`, which the job mounts as a file and sends with `-H @file` (never in `SOURCE_URL` or
an environment variable, which `kubectl describe` shows):

```bash
printf 'Authorization: Bearer %s\n' "$(cat source.token)" > header
kubectl -n pivotkit create secret generic pivotkit-source --from-file=header=./header
rm header
```

The job runs as the user 10001 too, so the files it writes are the server's to read. Some NFS
servers ignore `fsGroup`: there the volume's directory must be writable by the user 10001 already
(set by the storage's administrator, or by a provisioner option). Fetch the first data right after
applying (`kubectl create job --from=cronjob/...`, as above), else the source is missing until the
schedule runs it. The job's image and command are an example: any program that writes the file and
renames it does.

### A sidecar with an emptyDir { #sidecar }

A second container in the pod fetches the data into an `emptyDir` that the server's container mounts
read-only. No ReadWriteMany storage is needed, and each pod has its own copy (fetched again after a
restart). The example uses [git-sync](https://github.com/kubernetes/git-sync) (v4), which clones a
Git repository and flips a symbolic link to each new commit. Starting from the example manifest:
remove the CronJob, its NetworkPolicy `pivotkit-fetch-data` and the volume claim `pivotkit-data`;
point the source at the link in the ConfigMap; replace the Deployment's `data` volume and add the
container and its `/tmp`:

```json
"sales": { "file": "/data/git/current/sales.csv", "title": "Sales", "policy": { "fields": { "Region": "show", "Product": "show", "Customer": "hide" } } }
```

```yaml
      containers:
        - name: pivotkit
          # as in the example; its mount of data at /data stays readOnly: true
        - name: git-sync
          image: registry.k8s.io/git-sync/git-sync:v4.8.0
          args:
            - --repo=https://git.example.com/reports/data.git
            - --root=/data/git
            - --link=current
            - --period=5m
          securityContext:
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              memory: 256Mi
          volumeMounts:
            - name: data
              mountPath: /data
            # the image's HOME
            - name: git-tmp
              mountPath: /tmp
      volumes:
        - name: data
          emptyDir:
            sizeLimit: 1Gi
        - name: git-tmp
          emptyDir:
            sizeLimit: 64Mi
```

Mount the volume at the same path in both containers, so the link resolves the same way in each.
The server follows the link on every call: a flip to a new commit is read by the next report, and a
call that reads the file in the moment of the flip may fail once. git-sync's image sets `HOME` to
`/tmp`, hence the `emptyDir` there with the read-only root file system. `files.allowDirs`, if you use it, is resolved once at
start and the server does not start while a directory named there is missing: name the volume's
mount (`/data`), which exists from the start, not a directory git-sync makes later (`/data/git`) or the
link (`/data/git/current`). A private repository needs credentials (git-sync's `--password-file` or
`--ssh-key-file`, from a Secret); over SSH, git may need a passwd entry for the user 10001 (git-sync's
`--add-user`; not tried here). The policy `pivotkit` needs egress to the Git server (port 443, as
for [the issuer](#oauth-egress)); it holds for both containers of the pod. This sidecar setup follows
git-sync's documentation and passes the schema check, but has not been run in a cluster here: check
the flags against the documentation of the version you run. Any other sidecar works the same way when
it renames or flips a link.

The images of the CronJob and the sidecar are third-party images pinned by tag; pin them by digest
(`image@sha256:...`) where you need the exact image every time, as for pivotkit's own.

## Service and Ingress { #service }

```yaml
--8<-- "kubernetes.example.yaml:service"
```

```yaml
--8<-- "kubernetes.example.yaml:ingress"
```

The Ingress sends everything on the host to the Service: `/mcp`, `/api/v1`, `/openapi.json`, the
`/.well-known/` addresses of [OAuth](../reference/mcp.md#oauth) and the [download links](../reference/delivery.md)
under `/downloads/` are all served by the one process.
Without a token it answers the quick-start page at `/` (`http.page: false` turns it off), `/healthz`
and `/readyz`; everything else needs one. It
needs an ingress controller in the cluster (and `ingressClassName` where the cluster has no default
class); `pivotkit-tls` is the certificate's Secret, by hand or from a tool such as cert-manager. The
controller must pass the request's `Host` on unchanged and write `X-Forwarded-For`. Its time limit
for an answer must be longer than `compute.queueMs` + `compute.timeMs` (40 seconds with the
defaults): check your controller's default.

To publish less, give the Ingress the paths `/mcp`, `/api/v1` and `/downloads` (and with OAuth the prefix
`/.well-known/oauth-protected-resource`) instead of `/`. When the ingress controller sits behind a
LoadBalancer Service, the client's address reaches it only with `externalTrafficPolicy: Local` (or the
PROXY protocol, by controller); otherwise `X-Forwarded-For` and so the server's limits per address
see a node's address.

## NetworkPolicy { #networkpolicy }

```yaml
--8<-- "kubernetes.example.yaml:networkpolicy"
```

`default-deny` stops all traffic of every pod in the namespace that the other policies do not allow:
`pivotkit` lets the ingress controller in and name lookups out, `pivotkit-fetch-data` lets the job's
pods look up names and reach the data's host on port 443 (put the addresses its host name resolves
to there; a policy cannot name a host). Policies take effect only with a network plugin that enforces NetworkPolicy. The namespace selector uses
the label `kubernetes.io/metadata.name`, which Kubernetes sets on every namespace: put the name of
your ingress controller's namespace there (`ingress-controller` is a placeholder). A controller that
runs with `hostNetwork` arrives from the nodes' addresses instead of its pods': allow the nodes'
address range as an `ipBlock` there (check how your cluster's controller runs). The kubelet's
probes come from the node, which most network plugins let through whatever the policy says; check
yours if the pod never gets ready with the policy applied.

### Clients inside the cluster { #in-cluster }

With the policy as it is, programs in the cluster call the public address through the ingress
controller. To let them call the Service directly (`http://pivotkit.pivotkit.svc:3333`), allow their
namespace in the policy's `ingress`, add the names they call (`pivotkit`, `pivotkit.pivotkit.svc`, `pivotkit.pivotkit.svc.cluster.local`) to `http.allowHosts`,
and turn `http.trustProxy` off: a direct caller can write any `X-Forwarded-For`, and with
`trustProxy` the server would believe it (its limits per address count by that header). With
`trustProxy` off, every request through the controller counts with the controller's address.

### Egress { #egress }

With static tokens the server opens no connection of its own: the policy allows name lookups (the
cluster DNS, `k8s-app: kube-dns` in `kube-system` on most clusters) and nothing else. Clusters
whose DNS is elsewhere need another rule for it: NodeLocal DNSCache answers on an address of the
node, and OpenShift runs its DNS in the namespace `openshift-dns`. With OAuth it
needs the issuer too ([below](#oauth-egress)), and an [HTTP source](../reference/sources.md#http)
needs the addresses of its backend (port 443) as the issuer does, and of its token endpoint when it
signs in with client credentials or a token exchange ([backend sign-in](../reference/sources.md#http-auth));
a backend inside the cluster also needs `intranet: true` on it, since cluster addresses are private
ones, and a token endpoint inside the cluster `intranet: true` in its sign-in's settings (an issuer
inside the cluster `auth.intranet: true`, see [below](#oauth-egress)).

## Sign-in with Authentik { #oauth }

With OAuth the MCP endpoint takes access tokens of your identity provider instead of static tokens
([OAuth 2.1](../reference/mcp.md#oauth) has every key; it works with any provider that issues JWT
access tokens). With [Authentik](https://goauthentik.io/):

1. Under **Customization > Property Mappings**, create a **Scope Mapping** with the **Scope name**
   `pivotkit` and an expression that returns `{}` (the scope adds no claims). Authentik drops a
   scope a client asks for when the provider has no scope mapping for it, and a token without
   `pivotkit` then gets 403.
2. Under **Applications > Applications**, **New Application** with the slug `pivotkit` and the
   provider type **OAuth2/OIDC**, with these provider settings:
     - **Client Type**: **Public** (an MCP client keeps no secret; it signs in with PKCE).
     - **Redirect URIs/Origins (RegEx)**: the callback addresses of the MCP clients you allow, from
       their documentation, each with the matching mode **Strict** (the address exactly). With
       **Regex** the whole address must match the expression; escape the dots
       (`https://app\.example\.com/callback`) and use no `.*`, or a sign-in can be sent to an
       address you did not mean.
     - **Signing Key**: a certificate with an RSA key (RS256), an EC P-256 key (ES256) or an Ed25519
       key (EdDSA), the algorithms the server accepts by default (`auth.algorithms`; Authentik signs
       with ES384 or ES512 for the other EC curves). Without a signing key, Authentik signs with HS256
       and the client secret, which the server refuses.
     - **Encryption Key**: none. With one the access token is encrypted (JWE), which the server cannot
       read.
     - **Access Token Validity**: minutes, e.g. `minutes=10`; the default is one hour, and a token
       stays valid until it expires.
     - **Scopes**: add the `pivotkit` mapping to the selected scopes.
3. On the application's **Policy / Group / User Bindings**, bind the group (or users, or a policy)
   that may use pivotkit (**Bind existing group/user**). An application without any binding lets
   every user of Authentik sign in to it.
4. Note the provider's **Client ID**.

The server accepts every access token this provider issues for its audience with the required
scopes: who gets one is decided in Authentik, by the bindings of step 3 and the scopes.

The issuer is `https://auth.example.com/application/o/pivotkit/` (the application's slug at the end,
with the default issuer mode, each provider its own issuer). Authentik puts the client ID into the
access token's `aud`, and the granted scopes into its `scope` claim. The `auth` part of the
configuration:

```json
{
  "auth": { "mode": "oauth",
    "issuer": "https://auth.example.com/application/o/pivotkit/",
    "resource": "https://reports.example.com/mcp",
    "audience": ["<the provider's client id>"],
    "requiredScopes": ["pivotkit"] },
  "http": { "publicUrl": "https://reports.example.com/", "trustProxy": true, "enable": ["mcp"] }
}
```

- `requiredScopes` also keeps Authentik's ID tokens out: they carry the same `aud` but no `scope`.
  Do not set `auth.requireTyp`: Authentik's access tokens carry no `typ` of `at+jwt`.
- `http.enable: ["mcp"]` serves the MCP endpoint only. The REST service is a resource of its own
  ([REST sign-in](../reference/rest.md#auth)) whose tokens must carry its audience; with Authentik
  every token of the provider carries the same client ID. To serve REST from the same provider, set
  `rest.audience` to that client ID and give REST a scope of its own (`rest.requiredScopes`, a second
  scope mapping); a token with both scopes then works on both endpoints.

### Egress to the issuer { #oauth-egress }

The server loads the issuer's metadata and keys over HTTPS; until then `/readyz` answers 503. A
NetworkPolicy cannot name a host: allow the addresses `auth.example.com` resolves to from inside the
cluster, on port 443. Add the rule to the policy's `egress`:

```yaml
    - to:
        - ipBlock:
            cidr: 192.0.2.10/32
      ports:
        - port: 443
          protocol: TCP
```

When Authentik runs in the same cluster and its host name resolves to the ingress controller, allow
the controller's namespace instead of an `ipBlock`. An issuer whose name resolves to a cluster or
other private address also needs `"intranet": true` in `auth`: the server refuses loopback and
private addresses for the issuer without it (`check-config` names it).

What these settings are based on: Authentik's
[OAuth2 provider documentation](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)
(issuer, signing key, PKCE) and its source code at the release `version/2026.8.5`
(`authentik/providers/oauth2/`: the access token's `aud`, `scope` and header, the signing algorithm
per key, the default validity, scopes without a mapping, redirect addresses matched in full;
`authentik/policies/engine.py`: an application without bindings passes everyone; `web/src/admin/`:
the labels of the forms), checked in November 2026. Labels
and defaults can change between Authentik releases. Whether Authentik reads the `resource` parameter
of [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707) was not checked; the server does not need it,
since it accepts the client ID as audience. Decode an access token of your own to see what your
setup issues.

## Update { #update }

To update, write the new tag or digest into the Deployment and apply it again
([Kubernetes in Update an installation](upgrading.md#update-image)); with `strategy: Recreate` the old
pod stops before the new one starts.

## The whole manifest { #manifest }

[docker/kubernetes.example.yaml](https://github.com/eizedev/pivotkit/blob/main/docker/kubernetes.example.yaml)
holds the Namespace, the ConfigMap, the two volume claims, the Deployment, the Service, the Ingress,
the three NetworkPolicies and the CronJob, in this order. To check your changed copy against the Kubernetes
API schemas without a cluster, use [kubeconform](https://github.com/yannh/kubeconform)
(`kubeconform -strict -summary kubernetes.example.yaml`), or `kubectl apply --dry-run=server` with
one.
