import { BatchId, Bee, NULL_TOPIC, PrivateKey, Reference } from '@ethersphere/bee-js'
import { randomBytes, Wallet } from 'ethers'

import { Identity, IdentityType } from '../providers/Feeds'
import { LocalStorageKeys } from '../utils/local-storage'

import { uuidV4, waitUntilStampUsable } from '.'

export function generateWallet(): Wallet {
  const privateKey = randomBytes(PrivateKey.LENGTH).toString()

  return new Wallet(privateKey)
}

export function persistIdentity(identities: Identity[], identity: Identity): void {
  const existingIndex = identities.findIndex(x => x.uuid === identity.uuid)

  if (existingIndex !== -1) {
    identities.splice(existingIndex, 1)
  }
  identities.unshift(identity)
  localStorage.setItem(LocalStorageKeys.feeds, JSON.stringify(identities))
}

export function persistIdentitiesWithoutUpdate(identities: Identity[]): void {
  localStorage.setItem(LocalStorageKeys.feeds, JSON.stringify(identities))
}

export async function convertWalletToIdentity(
  identity: Wallet,
  type: IdentityType,
  name: string,
  password?: string,
): Promise<Identity> {
  if (type === 'V3' && !password) {
    throw Error('V3 passwords require password')
  }

  const identityString = type === 'PRIVATE_KEY' ? identity.privateKey : await identity.encrypt(password as string)

  return {
    uuid: uuidV4(),
    name,
    type: password ? 'V3' : 'PRIVATE_KEY',
    address: identity.address,
    identity: identityString,
  }
}

export async function importIdentity(name: string, data: string): Promise<Identity | null> {
  if (data.length === 64) {
    const wallet = await getWallet('PRIVATE_KEY', data)

    return {
      uuid: uuidV4(),
      name,
      type: 'PRIVATE_KEY',
      identity: data,
      address: wallet.address,
    }
  }

  if (data.length === 66 && data.toLowerCase().startsWith('0x')) {
    const wallet = await getWallet('PRIVATE_KEY', data.slice(2))

    return { uuid: uuidV4(), name, type: 'PRIVATE_KEY', identity: data, address: wallet.address }
  }
  try {
    const { address } = JSON.parse(data)

    return { uuid: uuidV4(), name, type: 'V3', identity: data, address }
  } catch {
    return null
  }
}

function getWalletFromIdentity(identity: Identity, password?: string): Promise<Wallet> {
  return getWallet(identity.type, identity.identity, password)
}

async function getWallet(type: IdentityType, data: string, password?: string): Promise<Wallet> {
  if (type === 'PRIVATE_KEY') {
    return new Wallet(data)
  }

  if (!password) {
    throw new Error('password is required for wallet')
  }

  const w = await Wallet.fromEncryptedJson(data, password)

  return new Wallet(w.privateKey)
}

export async function updateFeed(
  beeApi: Bee,
  identity: Identity,
  hash: Reference | string,
  stamp: BatchId | string,
  password?: string,
): Promise<void> {
  const wallet = await getWalletFromIdentity(identity, password)

  if (!identity.feedHash) {
    identity.feedHash = (await beeApi.createFeedManifest(stamp, NULL_TOPIC, wallet.address)).toHex()
  }

  const writer = beeApi.makeFeedWriter(NULL_TOPIC, wallet.privateKey)

  await waitUntilStampUsable(stamp, beeApi)
  await writer.upload(stamp, hash)
}
