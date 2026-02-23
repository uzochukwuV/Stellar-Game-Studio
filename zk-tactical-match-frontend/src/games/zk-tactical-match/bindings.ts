import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBQYE4ARN4TU47JJIATZMRZGWCLEHALCOBATMT22LBYZMENTNCYKFBAX",
  }
} as const


export interface Game {
  player1: string;
  player1_points: i128;
  player1_proof_hash: Option<Buffer>;
  player1_score: Option<u32>;
  player1_tactic: Option<u32>;
  player2: string;
  player2_points: i128;
  player2_proof_hash: Option<Buffer>;
  player2_score: Option<u32>;
  player2_tactic: Option<u32>;
  winner: Option<string>;
}

export const Errors = {
  1: {message:"GameNotFound"},
  2: {message:"NotPlayer"},
  3: {message:"AlreadySubmitted"},
  4: {message:"BothPlayersNotSubmitted"},
  5: {message:"GameAlreadyEnded"},
  6: {message:"InvalidTactic"},
  7: {message:"InvalidProof"}
}

/**
 * Tactical formations: 0=Defensive, 1=Balanced, 2=Aggressive, 3=AllOut
 */
export enum Tactic {
  Defensive = 0,
  Balanced = 1,
  Aggressive = 2,
  AllOut = 3,
}

export type DataKey = {tag: "Game", values: readonly [u32]} | {tag: "GameHubAddress", values: void} | {tag: "Admin", values: void};

export interface Client {
  /**
   * Construct and simulate a get_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current GameHub contract address
   * 
   * # Returns
   * * `Address` - The GameHub contract address
   */
  get_hub: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a new GameHub contract address
   * 
   * # Arguments
   * * `new_hub` - The new GameHub contract address
   */
  set_hub: ({new_hub}: {new_hub: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the contract WASM hash (upgrade contract)
   * 
   * # Arguments
   * * `new_wasm_hash` - The hash of the new WASM binary
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get game state including scores and tactics (after resolution).
   * 
   * # Arguments
   * * `session_id` - Game session ID
   * 
   * # Returns
   * * `Game` - Complete game state
   */
  get_game: ({session_id}: {session_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Game>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get the current admin address
   * 
   * # Returns
   * * `Address` - The admin address
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a new admin address
   * 
   * # Arguments
   * * `new_admin` - The new admin address
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a start_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Start a new ZK Tactical Match between two players.
   * 
   * # Arguments
   * * `session_id` - Unique session identifier
   * * `player1` - First player address
   * * `player2` - Second player address
   * * `player1_points` - Betting amount for player 1
   * * `player2_points` - Betting amount for player 2
   */
  start_game: ({session_id, player1, player2, player1_points, player2_points}: {session_id: u32, player1: string, player2: string, player1_points: i128, player2_points: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resolve_match transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Resolve match after both players submit tactics.
   * Computes scores using strategic matrix and determines winner.
   * 
   * # Arguments
   * * `session_id` - Game session ID
   * 
   * # Returns
   * * `Address` - Winner address
   */
  resolve_match: ({session_id}: {session_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a submit_tactic transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Submit tactical choice with ZK proof.
   * 
   * **ZK Proof validates:**
   * - tactic ∈ [0-3]
   * - player identity
   * - hasn't already submitted
   * 
   * # Arguments
   * * `session_id` - Game session ID
   * * `player` - Player address
   * * `tactic` - Tactical choice (0=Defensive, 1=Balanced, 2=Aggressive, 3=AllOut)
   * * `proof` - ZK proof bytes (Noir-generated proof for on-chain verification)
   */
  submit_tactic: ({session_id, player, tactic, proof}: {session_id: u32, player: string, tactic: u32, proof: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, game_hub}: {admin: string, game_hub: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, game_hub}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABEdhbWUAAAALAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAADnBsYXllcjFfcG9pbnRzAAAAAAALAAAAAAAAABJwbGF5ZXIxX3Byb29mX2hhc2gAAAAAA+gAAAPuAAAAIAAAAAAAAAANcGxheWVyMV9zY29yZQAAAAAAA+gAAAAEAAAAAAAAAA5wbGF5ZXIxX3RhY3RpYwAAAAAD6AAAAAQAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAAOcGxheWVyMl9wb2ludHMAAAAAAAsAAAAAAAAAEnBsYXllcjJfcHJvb2ZfaGFzaAAAAAAD6AAAA+4AAAAgAAAAAAAAAA1wbGF5ZXIyX3Njb3JlAAAAAAAD6AAAAAQAAAAAAAAADnBsYXllcjJfdGFjdGljAAAAAAPoAAAABAAAAAAAAAAGd2lubmVyAAAAAAPoAAAAEw==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAAQQWxyZWFkeVN1Ym1pdHRlZAAAAAMAAAAAAAAAF0JvdGhQbGF5ZXJzTm90U3VibWl0dGVkAAAAAAQAAAAAAAAAEEdhbWVBbHJlYWR5RW5kZWQAAAAFAAAAAAAAAA1JbnZhbGlkVGFjdGljAAAAAAAABgAAAAAAAAAMSW52YWxpZFByb29mAAAABw==",
        "AAAAAwAAAERUYWN0aWNhbCBmb3JtYXRpb25zOiAwPURlZmVuc2l2ZSwgMT1CYWxhbmNlZCwgMj1BZ2dyZXNzaXZlLCAzPUFsbE91dAAAAAAAAAAGVGFjdGljAAAAAAAEAAAAAAAAAAlEZWZlbnNpdmUAAAAAAAAAAAAAAAAAAAhCYWxhbmNlZAAAAAEAAAAAAAAACkFnZ3Jlc3NpdmUAAAAAAAIAAAAAAAAABkFsbE91dAAAAAAAAw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAAAAAAAAAAADkdhbWVIdWJBZGRyZXNzAAAAAAAAAAAAAAAAAAVBZG1pbgAAAA==",
        "AAAAAAAAAF5HZXQgdGhlIGN1cnJlbnQgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzCgojIFJldHVybnMKKiBgQWRkcmVzc2AgLSBUaGUgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzAAAAAAAHZ2V0X2h1YgAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAF5TZXQgYSBuZXcgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzCgojIEFyZ3VtZW50cwoqIGBuZXdfaHViYCAtIFRoZSBuZXcgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzAAAAAAAHc2V0X2h1YgAAAAABAAAAAAAAAAduZXdfaHViAAAAABMAAAAA",
        "AAAAAAAAAHFVcGRhdGUgdGhlIGNvbnRyYWN0IFdBU00gaGFzaCAodXBncmFkZSBjb250cmFjdCkKCiMgQXJndW1lbnRzCiogYG5ld193YXNtX2hhc2hgIC0gVGhlIGhhc2ggb2YgdGhlIG5ldyBXQVNNIGJpbmFyeQAAAAAAAAd1cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAJdHZXQgZ2FtZSBzdGF0ZSBpbmNsdWRpbmcgc2NvcmVzIGFuZCB0YWN0aWNzIChhZnRlciByZXNvbHV0aW9uKS4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gR2FtZSBzZXNzaW9uIElECgojIFJldHVybnMKKiBgR2FtZWAgLSBDb21wbGV0ZSBnYW1lIHN0YXRlAAAAAAhnZXRfZ2FtZQAAAAEAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAABAAAD6QAAB9AAAAAER2FtZQAAAAM=",
        "AAAAAAAAAEhHZXQgdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcwoKIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIGFkbWluIGFkZHJlc3MAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAEpTZXQgYSBuZXcgYWRtaW4gYWRkcmVzcwoKIyBBcmd1bWVudHMKKiBgbmV3X2FkbWluYCAtIFRoZSBuZXcgYWRtaW4gYWRkcmVzcwAAAAAACXNldF9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAARNTdGFydCBhIG5ldyBaSyBUYWN0aWNhbCBNYXRjaCBiZXR3ZWVuIHR3byBwbGF5ZXJzLgoKIyBBcmd1bWVudHMKKiBgc2Vzc2lvbl9pZGAgLSBVbmlxdWUgc2Vzc2lvbiBpZGVudGlmaWVyCiogYHBsYXllcjFgIC0gRmlyc3QgcGxheWVyIGFkZHJlc3MKKiBgcGxheWVyMmAgLSBTZWNvbmQgcGxheWVyIGFkZHJlc3MKKiBgcGxheWVyMV9wb2ludHNgIC0gQmV0dGluZyBhbW91bnQgZm9yIHBsYXllciAxCiogYHBsYXllcjJfcG9pbnRzYCAtIEJldHRpbmcgYW1vdW50IGZvciBwbGF5ZXIgMgAAAAAKc3RhcnRfZ2FtZQAAAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADnBsYXllcjFfcG9pbnRzAAAAAAALAAAAAAAAAA5wbGF5ZXIyX3BvaW50cwAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAKNJbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIEdhbWVIdWIgYWRkcmVzcyBhbmQgYWRtaW4KCiMgQXJndW1lbnRzCiogYGFkbWluYCAtIEFkbWluIGFkZHJlc3MgKGNhbiB1cGdyYWRlIGNvbnRyYWN0KQoqIGBnYW1lX2h1YmAgLSBBZGRyZXNzIG9mIHRoZSBHYW1lSHViIGNvbnRyYWN0AAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhnYW1lX2h1YgAAABMAAAAA",
        "AAAAAAAAAMRSZXNvbHZlIG1hdGNoIGFmdGVyIGJvdGggcGxheWVycyBzdWJtaXQgdGFjdGljcy4KQ29tcHV0ZXMgc2NvcmVzIHVzaW5nIHN0cmF0ZWdpYyBtYXRyaXggYW5kIGRldGVybWluZXMgd2lubmVyLgoKIyBBcmd1bWVudHMKKiBgc2Vzc2lvbl9pZGAgLSBHYW1lIHNlc3Npb24gSUQKCiMgUmV0dXJucwoqIGBBZGRyZXNzYCAtIFdpbm5lciBhZGRyZXNzAAAADXJlc29sdmVfbWF0Y2gAAAAAAAABAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAQAAA+kAAAATAAAAAw==",
        "AAAAAAAAAWNTdWJtaXQgdGFjdGljYWwgY2hvaWNlIHdpdGggWksgcHJvb2YuCgoqKlpLIFByb29mIHZhbGlkYXRlczoqKgotIHRhY3RpYyDiiIggWzAtM10KLSBwbGF5ZXIgaWRlbnRpdHkKLSBoYXNuJ3QgYWxyZWFkeSBzdWJtaXR0ZWQKCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gR2FtZSBzZXNzaW9uIElECiogYHBsYXllcmAgLSBQbGF5ZXIgYWRkcmVzcwoqIGB0YWN0aWNgIC0gVGFjdGljYWwgY2hvaWNlICgwPURlZmVuc2l2ZSwgMT1CYWxhbmNlZCwgMj1BZ2dyZXNzaXZlLCAzPUFsbE91dCkKKiBgcHJvb2ZgIC0gWksgcHJvb2YgYnl0ZXMgKE5vaXItZ2VuZXJhdGVkIHByb29mIGZvciBvbi1jaGFpbiB2ZXJpZmljYXRpb24pAAAAAA1zdWJtaXRfdGFjdGljAAAAAAAABAAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAAZ0YWN0aWMAAAAAAAQAAAAAAAAABXByb29mAAAAAAAADgAAAAEAAAPpAAAAAgAAAAM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_hub: this.txFromJSON<string>,
        set_hub: this.txFromJSON<null>,
        upgrade: this.txFromJSON<null>,
        get_game: this.txFromJSON<Result<Game>>,
        get_admin: this.txFromJSON<string>,
        set_admin: this.txFromJSON<null>,
        start_game: this.txFromJSON<Result<void>>,
        resolve_match: this.txFromJSON<Result<string>>,
        submit_tactic: this.txFromJSON<Result<void>>
  }
}