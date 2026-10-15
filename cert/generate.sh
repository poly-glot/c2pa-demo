#!/bin/sh
set -eu
cd "$(dirname "$0")"

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
    -config root-ca.cnf -keyout root-ca.key -out root-ca.pem

openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
    -config claim-signer.cnf -keyout claim-signer.key -out claim-signer.csr

openssl x509 -req -in claim-signer.csr -CA root-ca.pem -CAkey root-ca.key -CAcreateserial -days 365 \
    -extfile claim-signer.cnf -extensions v3 -out claim-signer-leaf.pem

cat claim-signer-leaf.pem root-ca.pem > claim-signer.pem
rm -f claim-signer.csr claim-signer-leaf.pem root-ca.srl

openssl x509 -in claim-signer.pem -noout -subject -issuer
