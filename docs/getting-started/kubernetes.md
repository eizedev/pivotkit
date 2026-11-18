---
title: Kubernetes
description: Run pivotkit-server with the REST service and the MCP server on Kubernetes - how data files reach /data (a CronJob on a ReadWriteMany volume, or a sidecar), memory and workers, volumes, Service, Ingress, NetworkPolicy, sign-in with Authentik, and a complete example manifest.
---

# Kubernetes

This page runs the [container image](../reference/container.md) on Kubernetes. One Deployment
serves the [REST service](../reference/rest.md) at `/api/v1` and the [MCP server](../reference/mcp.md)
at `/mcp` on port 3333, from one configuration file. The example manifest
[docker/kubernetes.example.yaml](https://github.com/eizedev/pivotkit/blob/pivotkit-server@0.3.1/docker/kubernetes.example.yaml)
holds every part shown below. The sections explain each one.

## Set it up { #setup }

1. Download the manifest:

    ```bash
    curl -fsSLO https://raw.githubusercontent.com/eizedev/pivotkit/pivotkit-server@0.3.1/docker/kubernetes.example.yaml
    ```

2. Edit your copy. Always set these:

    - `<version>`: a release of pivotkit-server, or the image's digest. See
      [which tag](upgrading.md#update-image).
    - `reports.example.com`: your host name.
    - The CronJob's `SOURCE_URL`, and the addresses of its host in the NetworkPolicy
      `pivotkit-fetch-data`.
    - The namespace of your ingress controller in the NetworkPolicy `pivotkit`.

    Set these where needed:

    - The Ingress's `ingressClassName`, when the cluster has no default class.
    - The certificate's Secret `pivotkit-tls`. You make it by hand or with a tool such as
      cert-manager.
    - The `storageClassName` of `pivotkit-data`, when the default class offers no ReadWriteMany.

3. Apply the manifest, fetch the data once, and read the token the server made at its first start:

    ```bash
    kubectl apply -f kubernetes.example.yaml
    kubectl -n pivotkit create job --from=cronjob/pivotkit-fetch-data pivotkit-fetch-data-first
    kubectl -n pivotkit rollout status deployment/pivotkit
    TOKEN=$(kubectl -n pivotkit exec deploy/pivotkit -- pivotkit-server token show admin)
    ```

    The server makes the token `admin` and the key of the [download links](../reference/delivery.md)
    on the volume `pivotkit-state`, so both survive a restart. See
    [made at the first start](../reference/rest.md#first-start). The pod's log names the same
    `kubectl exec` command, but never the token. For tokens of your own as Secrets, see
    [managed secrets](#managed-secrets).

## Check it { #check }

Check it from your machine through a port forward. The port forward sends `Host: localhost:3333`,
and the server answers that host:

```bash
kubectl -n pivotkit port-forward svc/pivotkit 3333:3333 &
curl -s http://localhost:3333/readyz
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/v1/sources
kill %1   # ends the port forward
```

`/readyz` answers `{"ok":true,...}`, and `/api/v1/sources` lists `sales`. A call to the source
answers 404 `FILE_NOT_AVAILABLE` until the job has written the file. The job's log shows its
progress: `kubectl -n pivotkit logs job/pivotkit-fetch-data-first`. Then check the same through the
Ingress:

```bash
curl -s -H "Authorization: Bearer $TOKEN" https://reports.example.com/api/v1/sources
```

Give the token to its users the way you hand out secrets.

## Configuration and token { #config }

The configuration is a ConfigMap mounted at `/config`, where the image reads
`/config/pivotkit.json`. Its keys are those of [the REST service](../reference/rest.md#running) and
[the MCP server](../reference/mcp.md#configuration):

```yaml
--8<-- "kubernetes.example.yaml:config"
```

- `http.publicUrl` is the address clients use. The server answers that host name, the localhost
  names and the names in `http.allowHosts`. Any other `Host`, such as the pod's IP address, gets
  403. Clients inside the cluster use the public address too, through the ingress controller. For
  the other way, see [clients inside the cluster](#in-cluster).
- `http.trustProxy` makes the server read the client's address from the last entry of
  `X-Forwarded-For`. The ingress controller writes that header. The address appears as `address` in
  the log. The log is JSON lines for the cluster's log agent. See
  [operations and logs](../reference/operations.md#kubernetes). With `http.trustProxy`, only the
  controller may reach the pod, through the [NetworkPolicy](#networkpolicy) below. If other clients
  can reach the pod, a client could name any address.
- The configuration names no token. At its first start the server makes `admin` in
  `/var/lib/pivotkit/secrets/`, and the key of the download links beside it. To set a new value:
  `kubectl -n pivotkit exec deploy/pivotkit -- pivotkit-server token new --file /var/lib/pivotkit/secrets/admin.token --force`.
  The server reads the file on every request, so the old token gets 401 at once, without a restart.
- `output.dir` is `/var/lib/pivotkit/out`, on the same volume.
- With [OAuth](#oauth) instead of tokens, add `auth` as shown there. The server then makes no token.
- The server does not read a changed ConfigMap again. Restart the Deployment:
  `kubectl -n pivotkit rollout restart deployment/pivotkit`.

### Managed secrets { #managed-secrets }

You can hand out tokens of your own: several, with scopes or profiles. Keep them in a Secret and name
them in `auth.tokens`. The server then makes no `admin`. The image makes the values, so you need no
tool on your machine:

```bash
kubectl -n pivotkit exec deploy/pivotkit -- pivotkit-server token new \
  | kubectl -n pivotkit create secret generic pivotkit-tokens --from-file=reports=/dev/stdin
```

Mount the Secret as a directory: `/run/secrets/pivotkit`, with `defaultMode: 0440`, readable through
`fsGroup`. Add `"auth": { "mode": "token", "tokens": [ { "name": "reports", "file": "/run/secrets/pivotkit/reports" } ] }`
to the ConfigMap. After a restart, `kubectl -n pivotkit exec deploy/pivotkit -- pivotkit-server token show reports`
prints the token for its users.

The server reads a token file on every request. To rotate a token, run
`kubectl create secret ... --dry-run=client -o yaml | kubectl apply -f -` with a new token. The
kubelet updates the file after a short delay, its sync period and cache. The new token then works
without a restart. That holds only without `subPath`: a file mounted with `subPath` never changes.

A token has at least 32 characters. Keep it out of the manifest and out of environment variables,
since `kubectl describe` shows those.

## The Deployment { #deployment }

```yaml
--8<-- "kubernetes.example.yaml:deployment"
```

What each setting is for:

| Setting | Why |
| --- | --- |
| `replicas: 1`, `strategy: Recreate` | One server process per state volume (`pivotkit-state`, ReadWriteOnce). One process keeps the count of the reports' files and cleans them up ([output directory](../reference/rest.md#auth)). A rolling update would run two pods on the volume for a while. |
| `enableServiceLinks: false` | With service links on, Kubernetes sets `PIVOTKIT_PORT=tcp://<address>:3333` in every pod of the namespace for the Service named `pivotkit`. The server then stops with `PIVOTKIT_PORT is "tcp://...", which Kubernetes sets for a Service named pivotkit`. The example also sets `PIVOTKIT_PORT` to 3333. |
| `automountServiceAccountToken: false` | pivotkit calls no Kubernetes API. |
| User and group 10001, `fsGroup: 10001` | 10001 is the image's user. `fsGroup` makes the volumes readable and `/var/lib/pivotkit` writable for it. It also makes a Secret's files with mode 0440 readable, see [managed secrets](#managed-secrets). `fsGroupChangePolicy: OnRootMismatch` changes the owner of a volume's files only when its top directory does not match yet. So a start does not walk a large volume every time. |
| The namespace's label `pod-security.kubernetes.io/enforce: restricted` | Kubernetes refuses any pod in the namespace that does not meet the restricted Pod Security Standard: non-root, no privilege escalation, no capabilities, a seccomp profile. Every pod of the example meets it. |
| `readOnlyRootFilesystem`, no capabilities, `RuntimeDefault` seccomp | The same as `--read-only --cap-drop ALL` in [Run it](../reference/container.md#run). `/tmp` is an `emptyDir`. |
| Probes with `Host: localhost` | A probe sends the pod's IP address as `Host`, which the server refuses. `/healthz` answers while the process runs, for liveness and startup. `/readyz` answers 200 only when the server can take work: the OAuth issuer is loaded, the workers are up and the output directory is writable ([Health](../reference/container.md#health)). |
| `terminationGracePeriodSeconds: 30` | After SIGTERM the server takes no new connection. It lets running reports finish for up to 25 seconds (`http.graceMs`). |

A source whose file is missing does not stop the server or `/readyz`. A call to that source answers
404 `FILE_NOT_AVAILABLE` until the file is there. `pivotkit-server check-config` reports such a file
as a `PROBLEM` the server starts with, and exits with 1. Run it with the flags of the container's
`serve`: `--host 0.0.0.0`, and `--enable` where you set it. Otherwise it checks another surface.

### More than one replica { #replicas }

- Each process counts the limits on callers in its own memory: `rest.rateLimit`, `mcp.rateLimit` and
  the refused tokens per address. With more than one replica, each counts on its own.
- The MCP endpoint keeps no sessions, so any replica can answer any request.
- Replicas need one state volume they all share (ReadWriteMany). Replicas that start together end
  with one token and one link key. A [download link](../reference/delivery.md) then works on every
  replica.
- pivotkit does not support a volume per pod, such as a StatefulSet's volume claim template, with
  the token made at the first start. Each pod would make its own. Give such replicas tokens and a
  link key of your own instead: [managed secrets](#managed-secrets) and
  `"output": { "downloads": { "key": { "file": "/run/secrets/download-key" } } }`. The server reads
  that key file again within a second of a change.

## Memory and workers { #sizing }

A pool of worker threads computes the reports over a file. `compute.*` in
[the configuration](../reference/mcp.md#configuration) sets it up:

| Key | Default | What it does |
| --- | --- | --- |
| `compute.workers` | 2 (at most 16) | Reports computed at once |
| `compute.memoryMb` | 1024 | The JavaScript heap a worker may use. A report that needs more fails with `LIMIT_EXCEEDED`, and the server replaces the worker |
| `compute.timeMs` | 30000 | The longest a report may compute (`TIMEOUT`) |
| `compute.queueMs` | 10000 | How long a call waits for a free worker before `BUSY` |
| `limits.fileBytes` | 50 MB | The largest file the server reads |

`compute.memoryMb` bounds a worker's JavaScript heap, but not all of its memory:

- The bound covers the old generation. The young generation adds up to 64 MB.
- The bytes of the file the worker reads lie outside the heap.
- The encoded columns lie outside it too. They are typed arrays, up to 12 bytes per row and column.
- Each worker keeps the last four data sets it read, so its memory stays up after a report instead
  of going back down. The encoded columns of all four count.

As a starting point for the container's memory limit:

```text
memory limit  =  main process  +  compute.workers x (compute.memoryMb + 64 MB + limits.fileBytes)
```

With the defaults that is about 150 MB + 2 x (1024 + 64 + 50) MB, about 2.4 GB. The example sets
2560Mi. Large files with many columns need more than this for the encoded columns the workers keep.
Watch the pod's memory with your own data.

With a limit below the sum, a report that alone would fail with `LIMIT_EXCEEDED` becomes an OOM
kill of the whole pod, with every report running in it. For a smaller pod, lower
`compute.memoryMb` or the workers, not the limit alone. With `compute.memoryMb` 512 and 2 workers,
a limit of about 1.4 GB is a starting point.

With code or HTTP sources, the main process also keeps up to `sourceCache.maxMb` of loaded data,
256 MiB by default ([bounds](../reference/sources.md#code-cache)). Add it to the limit, or lower
`sourceCache.maxMb`.

For an idea of real use, here is one measurement. It ran once with Node 26 on macOS, not with the
image. Take it as a rough order and check your own data with `kubectl top pod`. The source was a CSV
file of 30 MB with 700,000 rows and 6 columns. The process used about 100 MB without work. Each
worker that had computed a report over the file added about 470 MB.

A report runs on one worker thread. Give the pod about one CPU per worker that should compute at the
same time. The example requests half a CPU and sets no CPU limit.

## Data in /data { #data }

The server reads its sources from files. On Kubernetes, something has to put them there.

The server notices a new file by its identity, size and time. So replace a file with a new one in
one of these ways:

- Write it under another name in the same directory and rename it (`mv`).
- Flip a symbolic link to a new directory.

Never write into the file the server reads: a read in between gets half of it. The user 10001 must
be able to read the files.

### A CronJob on a ReadWriteMany volume { #cronjob }

A job fetches the data on a schedule. It writes the data to a volume that the pivotkit pods mount
read-only. The job's pod and the server's pods may run on different nodes. So the volume must allow
ReadWriteMany, as NFS, CephFS or a cloud provider's file storage do. If the cluster's default class
does not allow it, set `storageClassName` to a class that does.

```yaml
--8<-- "kubernetes.example.yaml:volumes"
```

```yaml
--8<-- "kubernetes.example.yaml:cronjob"
```

What the job does:

- It takes only HTTPS (`--proto '=https'`).
- It follows no redirects. A redirect would give an empty file.
- It stops at 50 MB. That is `limits.fileBytes`, the largest file the server reads.
- It replaces the data only after an answer 200 with content. On any failure the old file stays, and
  the job removes the temporary one.

When the data's host needs a credential, put the header line into the Secret `pivotkit-source`. The
job mounts it as a file and sends it with `-H @file`. Never put the credential in `SOURCE_URL` or in
an environment variable, since `kubectl describe` shows those:

```bash
printf 'Authorization: Bearer %s\n' "$(cat source.token)" > header
kubectl -n pivotkit create secret generic pivotkit-source --from-file=header=./header
rm header
```

The job runs as the user 10001 too, so the server can read the files it writes. Some NFS servers
ignore `fsGroup`. There the user 10001 must already be able to write to the volume's directory. The
storage's administrator sets that, or a provisioner option does.

Fetch the first data right after you apply the manifest, with `kubectl create job --from=cronjob/...`
as above. Otherwise the source is missing until the schedule runs the job. The job's image and
command are an example. Any program that writes the file and renames it does the job.

### A sidecar with an emptyDir { #sidecar }

A second container in the pod fetches the data into an `emptyDir`. The server's container mounts it
read-only. You need no ReadWriteMany storage. Each pod has its own copy and fetches it again after a
restart.

The example uses [git-sync](https://github.com/kubernetes/git-sync) (v4). It clones a Git repository
and flips a symbolic link to each new commit. Start from the example manifest:

1. Remove the CronJob, its NetworkPolicy `pivotkit-fetch-data` and the volume claim `pivotkit-data`.
2. In the ConfigMap, point the source at the link.
3. Replace the Deployment's `data` volume, and add the container and its `/tmp`.

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

The server follows the link on every call. The next report reads the new commit after a flip. A call
that reads the file in the moment of the flip may fail once.

git-sync's image sets `HOME` to `/tmp`. With the read-only root file system, `/tmp` therefore needs
the `emptyDir`.

If you use `files.allowDirs`, the server resolves it once at start. It does not start while a
directory named there is missing, so name the volume's mount (`/data`), which exists from the start.
Do not name a directory git-sync makes later (`/data/git`) or the link (`/data/git/current`).

A private repository needs credentials: git-sync's `--password-file` or `--ssh-key-file`, from a
Secret. Over SSH, git may need a passwd entry for the user 10001. git-sync's `--add-user` adds one.
That was not tried here.

The policy `pivotkit` needs egress to the Git server on port 443, as for
[the issuer](#oauth-egress). The policy holds for both containers of the pod.

This sidecar setup follows git-sync's documentation and passes the schema check. It has not been run
in a cluster here, so check the flags against the documentation of the version you run. Any other
sidecar works the same way when it renames or flips a link.

The images of the CronJob and the sidecar are third-party images pinned by tag. Pin them by digest
(`image@sha256:...`) where you need the exact image every time, as for pivotkit's own.

## Service and Ingress { #service }

```yaml
--8<-- "kubernetes.example.yaml:service"
```

```yaml
--8<-- "kubernetes.example.yaml:ingress"
```

The Ingress sends everything on the host to the Service. The one process serves all of it: `/mcp`,
`/api/v1`, `/openapi.json`, the `/.well-known/` addresses of [OAuth](../reference/mcp.md#oauth) and
the [download links](../reference/delivery.md) under `/downloads/`.

These answer without a token:

- the quick-start page at `/`. `http.page: false` turns it off.
- `/healthz` and `/readyz`
- the [download links](../reference/delivery.md) under `/downloads/`. The link is the credential.

Everything else needs a token.

The Ingress needs an ingress controller in the cluster. Where the cluster has no default class, it
also needs `ingressClassName`. `pivotkit-tls` is the certificate's Secret. You make it by hand or
with a tool such as cert-manager.

The controller must pass the request's `Host` on unchanged and write `X-Forwarded-For`. Its time
limit for an answer must be longer than `compute.queueMs` + `compute.timeMs`, which is 40 seconds
with the defaults. Check your controller's default.

To publish less, give the Ingress the paths `/mcp`, `/api/v1` and `/downloads` instead of `/`. With
OAuth, add the prefix `/.well-known/oauth-protected-resource`.

The ingress controller may sit behind a LoadBalancer Service. Then the client's address reaches it
only with `externalTrafficPolicy: Local`, or with the PROXY protocol, depending on the controller.
Otherwise `X-Forwarded-For` holds a node's address, and the server's per-address limits count the
node.

## NetworkPolicy { #networkpolicy }

```yaml
--8<-- "kubernetes.example.yaml:networkpolicy"
```

The three policies:

- `default-deny` stops all traffic of every pod in the namespace that the other policies do not
  allow.
- `pivotkit` lets the ingress controller in and name lookups out.
- `pivotkit-fetch-data` lets the job's pods look up names and reach the data's host on port 443. Put
  the addresses its host name resolves to there, since a policy cannot name a host.

Policies take effect only with a network plugin that enforces NetworkPolicy.

The namespace selector uses the label `kubernetes.io/metadata.name`, which Kubernetes sets on every
namespace. Put the name of your ingress controller's namespace there. `ingress-controller` is a
placeholder.

A controller that runs with `hostNetwork` arrives from the nodes' addresses instead of its pods'
addresses. Then allow the nodes' address range there as an `ipBlock`. Check how your cluster's
controller runs.

The kubelet's probes come from the node. Most network plugins let them through, whatever the policy
says. If the pod never gets ready with the policy applied, check your plugin.

### Clients inside the cluster { #in-cluster }

With the policy as it is, programs in the cluster call the public address through the ingress
controller. To let them call the Service directly (`http://pivotkit.pivotkit.svc:3333`):

1. Allow their namespace in the policy's `ingress`.
2. Add the names they call to `http.allowHosts`: `pivotkit`, `pivotkit.pivotkit.svc` and
   `pivotkit.pivotkit.svc.cluster.local`.
3. Turn `http.trustProxy` off.

A direct caller can write any `X-Forwarded-For`. With `trustProxy`, the server would believe it,
and its limits per address count by that header. With `trustProxy` off, every request through the
controller counts with the controller's address.

### Egress { #egress }

With static tokens the server opens no connection of its own. The policy allows name lookups and
nothing else. Name lookups go to the cluster DNS, which is `k8s-app: kube-dns` in `kube-system` on
most clusters.

Clusters whose DNS is elsewhere need another rule for it. For example, NodeLocal DNSCache answers on
an address of the node, and OpenShift runs its DNS in the namespace `openshift-dns`.

Other features need more egress:

- OAuth needs the issuer too. See [below](#oauth-egress).
- An [HTTP source](../reference/sources.md#http) needs the addresses of its backend on port 443, as
  the issuer does.
- It also needs the addresses of its token endpoint when it signs in with client credentials or a token exchange. See
  [backend sign-in](../reference/sources.md#http-auth).

Cluster addresses are private ones, so something inside the cluster needs a setting:

- A backend needs `intranet: true` on it.
- A token endpoint needs `intranet: true` in its sign-in's settings.
- An issuer needs `auth.intranet: true`. See [below](#oauth-egress).

### An internal certificate authority { #internal-ca }

A backend, a token endpoint or an issuer may have a certificate from an internal certificate
authority. The server then needs that authority's certificate in `NODE_EXTRA_CA_CERTS`. That is a
file of PEM certificates, which the server reads when it starts
([the network](../reference/sources.md#http-network), [OAuth 2.1](../reference/mcp.md#oauth)).

1. Put the file into a ConfigMap. A certificate is public, so a ConfigMap is enough. A Secret
   works the same way, with `secret` instead of `configMap` in the volume.

    ```bash
    kubectl -n pivotkit create configmap pivotkit-ca --from-file=ca.pem=./internal-ca.pem
    ```

2. In the Deployment, remove the comment marks of three parts:
    - the variable `NODE_EXTRA_CA_CERTS`
    - the mount `ca`
    - the volume `ca`, which names the ConfigMap `pivotkit-ca`
3. Apply the manifest. After a later change of the ConfigMap, restart the Deployment.

## Sign-in with Authentik { #oauth }

With OAuth, the MCP endpoint takes access tokens of your identity provider instead of static tokens.
It works with any provider that issues JWT access tokens. [OAuth 2.1](../reference/mcp.md#oauth) has
every key. With [Authentik](https://goauthentik.io/):

1. Under **Customization > Property Mappings**, create a **Scope Mapping**. Give it the **Scope name**
   `pivotkit` and an expression that returns `{}`. The scope adds no claims. Authentik drops a scope
   a client asks for when the provider has no scope mapping for it. A token without `pivotkit` then
   gets 403.
2. Under **Applications > Applications**, choose **New Application**. Give it the slug `pivotkit`
   and the provider type **OAuth2/OIDC**, with these provider settings:
     - **Client Type**: **Public**. An MCP client keeps no secret. It signs in with PKCE.
     - **Redirect URIs/Origins (RegEx)**: the callback addresses of the MCP clients you allow. Take
       them from the clients' documentation. Give each the matching mode **Strict**, which matches
       the address exactly. With **Regex**, the whole address must match the expression. Then
       escape the dots (`https://app\.example\.com/callback`) and use no `.*`. Otherwise a sign-in
       can be sent to an address you did not mean.
     - **Signing Key**: a certificate with one of the keys the server accepts by default
       (`auth.algorithms`): an RSA key (RS256), an EC P-256 key (ES256) or an Ed25519 key (EdDSA).
       For the other EC curves, Authentik signs with ES384 or ES512. Without a signing key,
       Authentik signs with HS256 and the client secret, which the server refuses.
     - **Encryption Key**: none. With one, Authentik encrypts the access token (JWE), and the server
       cannot read it.
     - **Access Token Validity**: minutes, for example `minutes=10`. The default is one hour. A token stays
       valid until it expires.
     - **Scopes**: add the `pivotkit` mapping to the selected scopes.
3. On the application's **Policy / Group / User Bindings**, bind the group that may use pivotkit
   (**Bind existing group/user**). You can bind users or a policy instead. An application without
   any binding lets every user of Authentik sign in to it.
4. Note the provider's **Client ID**.

The server accepts every access token this provider issues for its audience with the required
scopes. So Authentik decides who gets a token: by the bindings of step 3 and by the scopes.

The issuer is `https://auth.example.com/application/o/pivotkit/`. It ends with the application's
slug. That holds with the default issuer mode, where each provider has its own issuer. Authentik
puts the client ID into the access token's `aud`, and the granted scopes into its `scope` claim. The
`auth` part of the configuration:

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
- `http.enable: ["mcp"]` serves the MCP endpoint only. The REST service is a resource of its own,
  and its tokens must carry its audience ([REST sign-in](../reference/rest.md#auth)). With
  Authentik, every token of the provider carries the same client ID. To serve REST from the same
  provider, set `rest.audience` to that client ID. Give REST a scope of its own with
  `rest.requiredScopes` and a second scope mapping. A token with both scopes then works on both
  endpoints.

### Egress to the issuer { #oauth-egress }

The server loads the issuer's metadata and keys over HTTPS. Until then, `/readyz` answers 503. A
NetworkPolicy cannot name a host, so allow the addresses that `auth.example.com` resolves to from
inside the cluster, on port 443. Add the rule to the policy's `egress`:

```yaml
    - to:
        - ipBlock:
            cidr: 192.0.2.10/32
      ports:
        - port: 443
          protocol: TCP
```

Authentik may run in the same cluster, with its host name resolving to the ingress controller. Then
allow the controller's namespace instead of an `ipBlock`.

An issuer whose name resolves to a cluster address or another private address also needs
`"intranet": true` in `auth`. Without it, the server refuses loopback and private addresses for the
issuer, and `check-config` names the setting. The same setting covers the token endpoint of the
[download sign-in](../reference/delivery.md#sign-in).

These settings are based on the following sources, checked in November 2026:

- Authentik's [OAuth2 provider documentation](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/):
  issuer, signing key, PKCE.
- Authentik's source code at the release `version/2026.8.5`:
    - `authentik/providers/oauth2/`: the access token's `aud`, `scope` and header, the signing
      algorithm per key, the default validity, scopes without a mapping, and redirect addresses
      matched in full.
    - `authentik/policies/engine.py`: an application without bindings passes everyone.
    - `web/src/admin/`: the labels of the forms.

Labels and defaults can change between Authentik releases. It was not checked whether Authentik
reads the `resource` parameter of [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707). The server
does not need it, since it accepts the client ID as audience. Decode an access token of your own to
see what your setup issues.

## Update { #update }

To update, write the new tag or digest into the Deployment and apply it again. See
[Kubernetes in Update an installation](upgrading.md#update-image). With `strategy: Recreate`, the old
pod stops before the new one starts.

## The whole manifest { #manifest }

[docker/kubernetes.example.yaml](https://github.com/eizedev/pivotkit/blob/pivotkit-server@0.3.1/docker/kubernetes.example.yaml)
holds, in this order:

- the Namespace
- the ConfigMap
- the two volume claims
- the Deployment
- the Service
- the Ingress
- the three NetworkPolicies
- the CronJob

To check your changed copy against the Kubernetes API schemas without a cluster, use
[kubeconform](https://github.com/yannh/kubeconform): `kubeconform -strict -summary kubernetes.example.yaml`.
With a cluster, use `kubectl apply --dry-run=server`.
