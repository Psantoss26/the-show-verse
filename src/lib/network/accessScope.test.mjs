import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isExternalNetworkAccess,
  isLocalServerHost,
  parseHostPatterns
} from './accessScope.js'

test('loopback and private ranges count as the server network', () => {
  for (const host of [
    'localhost',
    '127.0.0.1',
    '127.1.2.3',
    '::1',
    '[::1]',
    '10.0.0.2',
    '192.168.1.130',
    '172.16.0.1',
    '172.31.255.255',
    '169.254.10.1',
    'fd00::1',
    'fe80::1'
  ]) {
    assert.equal(isLocalServerHost(host, []), true, `${host} debería ser local`)
  }
})

test('public hosts and the ranges next to the private ones are external', () => {
  for (const host of [
    'theshowverse.com',
    'www.theshowverse.com',
    // 172.16.0.0/12 son SOLO 172.16-172.31: los vecinos son públicos.
    '172.15.0.1',
    '172.32.0.1',
    '8.8.8.8',
    // No es una IPv4 válida, así que se trata como nombre de dominio.
    '999.1.1.1',
    '2606:4700::1111'
  ]) {
    assert.equal(isLocalServerHost(host, []), false, `${host} debería ser externo`)
  }
})

test('mDNS and home suffixes count as the server network', () => {
  assert.equal(isLocalServerHost('nas.local', []), true)
  assert.equal(isLocalServerHost('showverse.lan', []), true)
  assert.equal(isLocalServerHost('nas.home', []), true)
  assert.equal(isLocalServerHost('nas.internal', []), true)
  // `.locality` no es `.local`: el sufijo tiene que ser una etiqueta entera.
  assert.equal(isLocalServerHost('nas.locality', []), false)
})

test('hosts are normalized before matching', () => {
  assert.equal(isLocalServerHost('192.168.1.130:3000', []), true)
  assert.equal(isLocalServerHost('  NAS.Local.  ', []), true)
  assert.equal(isLocalServerHost('', []), false)
  assert.equal(isLocalServerHost(null, []), false)
})

test('extra patterns follow the same wildcard rule as the middleware', () => {
  const patterns = parseHostPatterns('mi-nas, *.casa.example, OTRO.HOST:8080')

  assert.deepEqual(patterns, ['mi-nas', '*.casa.example', 'otro.host'])
  assert.equal(isLocalServerHost('mi-nas', patterns), true)
  assert.equal(isLocalServerHost('otro.host', patterns), true)
  assert.equal(isLocalServerHost('salon.casa.example', patterns), true)
  assert.equal(isLocalServerHost('casa.example', patterns), false)
  assert.equal(isLocalServerHost('theshowverse.com', patterns), false)
})

test('external access is the inverse, and SSR never claims to be external', () => {
  assert.equal(isExternalNetworkAccess({ hostname: 'theshowverse.com', localHosts: [] }), true)
  assert.equal(isExternalNetworkAccess({ hostname: '192.168.1.130', localHosts: [] }), false)
  // Sin `window` y sin host explícito no se puede saber: se asume red del
  // servidor para NO apagar nada durante el render de servidor.
  assert.equal(isExternalNetworkAccess({ localHosts: [] }), false)
})
