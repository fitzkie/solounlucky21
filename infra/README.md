# infra — deployment guide

This directory contains the Bitcoin Core configuration and systemd unit for the
Unlucky21 signet node.

> **Warning:** The `rpcpassword` placeholder in `bitcoin.conf` **MUST** be
> replaced with a strong random password before deployment. Generate one with:
>
> ```sh
> openssl rand -hex 32
> ```

---

## 1. Deploy bitcoin.conf to the VPS

```sh
scp infra/bitcoin.conf unlucky21@<VPS_IP>:/tmp/bitcoin.conf
ssh unlucky21@<VPS_IP> sudo mv /tmp/bitcoin.conf /etc/unlucky21/bitcoin.conf
ssh unlucky21@<VPS_IP> sudo chown root:unlucky21 /etc/unlucky21/bitcoin.conf
ssh unlucky21@<VPS_IP> sudo chmod 640 /etc/unlucky21/bitcoin.conf
```

## 2. Create the ~/.bitcoin symlink (optional convenience)

Bitcoin-cli looks in `~/.bitcoin` by default. A symlink lets you run
`bitcoin-cli` without `-conf=` for quick debugging:

```sh
ssh unlucky21@<VPS_IP> \
    "mkdir -p /home/unlucky21/.bitcoin && \
     ln -sfn /etc/unlucky21/bitcoin.conf /home/unlucky21/.bitcoin/bitcoin.conf"
```

## 3. Install and enable the systemd unit

```sh
scp infra/bitcoin.service unlucky21@<VPS_IP>:/tmp/bitcoin.service
ssh unlucky21@<VPS_IP> sudo mv /tmp/bitcoin.service /etc/systemd/system/bitcoin.service
ssh unlucky21@<VPS_IP> sudo systemctl daemon-reload
ssh unlucky21@<VPS_IP> sudo systemctl enable --now bitcoin.service
```

## 4. Verify Bitcoin Core is running

```sh
ssh unlucky21@<VPS_IP> \
    bitcoin-cli -conf=/etc/unlucky21/bitcoin.conf getblockchaininfo
```

Expected output includes `"chain": "signet"` and an increasing `"blocks"` count
as the node syncs.

## 5. Verify getblocktemplate works

Once the node is fully synced, confirm that `getblocktemplate` returns a valid
template (signet requires the `signet` capability rule):

```sh
ssh unlucky21@<VPS_IP> \
    bitcoin-cli -conf=/etc/unlucky21/bitcoin.conf \
    getblocktemplate '{"rules":["segwit","signet"]}'
```

A successful response is a JSON object containing `"coinbasevalue"`,
`"transactions"`, and `"coinbasetxnweight"` fields. If `coinbasetxnweight` in
the response is near the limit, increase `coinbasetxnweight` in bitcoin.conf
and restart the service.
