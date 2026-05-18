# Kubernetes Deploy Guide

## Prerequisites
- VPS dengan k3s installed (atau k8s cluster lainnya)
- `kubectl` configured ke cluster
- GitHub repo dengan GHCR enabled

---

## Step 1 — Setup GitHub Secrets

Di GitHub repo → Settings → Secrets and variables → Actions, tambahkan:

| Secret | Value |
|--------|-------|
| `KUBECONFIG` | Output dari: `cat ~/.kube/config \| base64 -w 0` |

---

## Step 2 — Install k3s di VPS (kalau belum)

```bash
curl -sfL https://get.k3s.io | sh -

# Ambil kubeconfig
cat /etc/rancher/k3s/k3s.yaml
```

---

## Step 3 — Apply manifests ke cluster

```bash
# Buat namespace dulu
kubectl apply -f k8s/namespace.yml

# PVC (storage)
kubectl apply -f k8s/pvc.yml

# ConfigMap & Secret
kubectl apply -f k8s/configmap.yml
kubectl apply -f k8s/secret.yml    # ⚠️ edit nilai CHANGE_ME dulu!

# Services
kubectl apply -f k8s/service.yml

# Deployments
kubectl apply -f k8s/deployment.yml
```

---

## Step 4 — Setup GHCR pull secret

Agar k8s bisa pull image dari GHCR (private repo):

```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_PAT \
  --namespace=task-management
```

Generate PAT di GitHub → Settings → Developer settings → Personal access tokens
dengan scope: `read:packages`

---

## Step 5 — Run database migration

```bash
# Exec ke pod app
kubectl exec -it deployment/task-management \
  -n task-management \
  -- npx prisma migrate deploy
```

---

## Step 6 — Verify deployment

```bash
# Cek semua pod running
kubectl get pods -n task-management

# Cek services
kubectl get svc -n task-management

# Lihat logs app
kubectl logs deployment/task-management -n task-management -f

# Port-forward untuk test lokal
kubectl port-forward svc/task-management-service 3000:80 -n task-management
```

---

## CI/CD Flow setelah setup

Setiap push ke `main`:
1. GitHub Actions run tests
2. Build Docker image
3. Push ke `ghcr.io/USERNAME/task-management:sha-xxxxxxx`
4. `kubectl set image` → rolling update otomatis
5. Rollback otomatis kalau readiness probe gagal

