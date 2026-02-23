import { Client as ZkTacticalMatchClient, type Game } from './bindings';
import { NETWORK_PASSPHRASE, RPC_URL, DEFAULT_METHOD_OPTIONS, DEFAULT_AUTH_TTL_MINUTES, MULTI_SIG_AUTH_TTL_MINUTES } from '@/utils/constants';
import { contract, Address, authorizeEntry, xdr } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { signAndSendViaLaunchtube } from '@/utils/transactionHelper';
import { calculateValidUntilLedger } from '@/utils/ledgerUtils';
import { injectSignedAuthEntry } from '@/utils/authEntryUtils';


type ClientOptions = contract.ClientOptions;

export class ZkTacticalMatchService {
  private baseClient: ZkTacticalMatchClient;
  private contractId: string;

  constructor(contractId: string) {
    this.contractId = contractId;
    this.baseClient = new ZkTacticalMatchClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
    });
  }

  private createSigningClient(
    publicKey: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): ZkTacticalMatchClient {
    const options: ClientOptions = {
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey,
      ...signer,
    };
    return new ZkTacticalMatchClient(options);
  }

  async getGame(sessionId: number): Promise<Game | null> {
    try {
      const tx = await this.baseClient.get_game({ session_id: sessionId });
      const result = await tx.simulate();
      if (result.result.isOk()) {
        return result.result.unwrap();
      }
      return null;
    } catch (err) {
      console.log('[getGame] Error:', err);
      return null;
    }
  }

  async startGame(
    sessionId: number,
    player1Address: string,
    player2Address: string,
    player1Points: bigint,
    player2Points: bigint,
    callerAddress: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(callerAddress, signer);
    const tx = await client.start_game({
      session_id: sessionId,
      player1: player1Address,
      player2: player2Address,
      player1_points: player1Points,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);
    const sentTx = await signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, validUntilLedgerSeq);
    return sentTx.result;
  }

  async submitTactic(
    sessionId: number,
    playerAddress: string,
    tactic: number,
    proof: Uint8Array,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(playerAddress, signer);
    
    const tx = await client.submit_tactic({
      session_id: sessionId,
      player: playerAddress,
      tactic,
      proof: Buffer.from(proof),
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);
    const sentTx = await signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, validUntilLedgerSeq);
    return sentTx.result;
  }

  async resolveMatch(
    sessionId: number,
    callerAddress: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(callerAddress, signer);
    const tx = await client.resolve_match({ session_id: sessionId }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);
    const sentTx = await signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, validUntilLedgerSeq);
    return sentTx.result;
  }

  /**
   * STEP 1 (Player 2): Prepare start_game and export signed auth entry
   *
   * Player 2 (the joiner) builds the transaction with Player 1 as the source,
   * signs Player 2's auth entry, and exports it for Player 1 to complete.
   *
   * @param sessionId - Game session ID
   * @param player1 - Player 1 address (transaction source, the match creator)
   * @param player2 - Player 2 address (the current user who joined)
   * @param player1Points - Player 1's points amount
   * @param player2Points - Player 2's points amount
   * @param player2Signer - Player 2's signing capabilities
   * @returns Player 2's signed auth entry XDR
   */
  async prepareStartGameAsPlayer2(
    sessionId: number,
    player1: string,
    player2: string,
    player1Points: bigint,
    player2Points: bigint,
    player2Signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): Promise<string> {
    console.log('[prepareStartGameAsPlayer2] Building transaction with Player 1 as source');

    // Build transaction with Player 1 as the transaction source (they will submit it)
    const buildClient = new ZkTacticalMatchClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: player1, // Player 1 is the transaction source
    });

    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1,
      player2,
      player1_points: player1Points,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    if (!tx.simulationData?.result?.auth) {
      throw new Error('No auth entries found in simulation');
    }

    const authEntries = tx.simulationData.result.auth;
    console.log('[prepareStartGameAsPlayer2] Found', authEntries.length, 'auth entries');

    // Find Player 2's stubbed auth entry
    let player2AuthEntry = null;

    for (const entry of authEntries) {
      try {
        const entryAddress = entry.credentials().address().address();
        const entryAddressString = Address.fromScAddress(entryAddress).toString();
        console.log('[prepareStartGameAsPlayer2] Checking auth entry for:', entryAddressString);

        if (entryAddressString === player2) {
          player2AuthEntry = entry;
          console.log('[prepareStartGameAsPlayer2] Found Player 2 auth entry');
          break;
        }
      } catch (err) {
        console.log('[prepareStartGameAsPlayer2] Error reading auth entry:', err);
      }
    }

    if (!player2AuthEntry) {
      throw new Error(`No auth entry found for Player 2 (${player2})`);
    }

    // Calculate extended TTL for multi-sig flow
    const validUntilLedgerSeq = await calculateValidUntilLedger(RPC_URL, MULTI_SIG_AUTH_TTL_MINUTES);

    if (!player2Signer.signAuthEntry) {
      throw new Error('signAuthEntry not available');
    }

    console.log('[prepareStartGameAsPlayer2] Signing Player 2 auth entry');

    // Sign Player 2's auth entry
    const signedAuthEntry = await authorizeEntry(
      player2AuthEntry,
      async (preimage) => {
        const signResult = await player2Signer.signAuthEntry!(preimage.toXDR('base64'), {
          networkPassphrase: NETWORK_PASSPHRASE,
          address: player2,
        });
        if (signResult.error) {
          throw new Error(`Failed to sign: ${signResult.error.message}`);
        }
        return Buffer.from(signResult.signedAuthEntry, 'base64');
      },
      validUntilLedgerSeq,
      NETWORK_PASSPHRASE,
    );

    console.log('[prepareStartGameAsPlayer2] ✅ Player 2 auth entry signed successfully');
    return signedAuthEntry.toXDR('base64');
  }

  /**
   * STEP 2 (Player 1): Import Player 2's auth entry and finalize transaction
   *
   * Player 1 (the match creator) receives Player 2's signed auth entry,
   * rebuilds the transaction, signs Player 1's auth entry, and submits.
   *
   * @param player2SignedAuthEntryXdr - Player 2's signed auth entry XDR
   * @param sessionId - Game session ID
   * @param player1Address - Player 1's address (transaction source)
   * @param player2Address - Player 2's address (from matchmaking)
   * @param player1Points - Player 1's points amount
   * @param player2Points - Player 2's points amount
   * @param player1Signer - Player 1's signing capabilities
   * @returns Transaction result
   */
  async importAndFinalizeAsPlayer1(
    player2SignedAuthEntryXdr: string,
    sessionId: number,
    player1Address: string,
    player2Address: string,
    player1Points: bigint,
    player2Points: bigint,
    player1Signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    console.log('[importAndFinalizeAsPlayer1] Parsing Player 2 signed auth entry');

    // Parse Player 2's auth entry to validate
    const parsedAuthEntry = this.parseAuthEntry(player2SignedAuthEntryXdr);

    console.log('[importAndFinalizeAsPlayer1] Extracted auth entry params:', {
      sessionId: parsedAuthEntry.sessionId,
      playerAddress: parsedAuthEntry.playerAddress,
      playerPoints: parsedAuthEntry.playerPoints.toString(),
    });

    // Validation: Ensure auth entry matches expected Player 2
    if (parsedAuthEntry.playerAddress !== player2Address) {
      throw new Error('Auth entry is not from Player 2');
    }

    if (parsedAuthEntry.sessionId !== sessionId) {
      throw new Error('Auth entry session ID mismatch');
    }

    console.log('[importAndFinalizeAsPlayer1] Rebuilding transaction with Player 1 as source');

    // Rebuild transaction with Player 1 as source (we are Player 1)
    const buildClient = new ZkTacticalMatchClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: player1Address, // Player 1 is the transaction source
    });

    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1: player1Address,
      player2: player2Address,
      player1_points: player1Points,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    console.log('[importAndFinalizeAsPlayer1] Transaction built and simulated');
    console.log('[importAndFinalizeAsPlayer1] Transaction source:', player1Address);
    console.log('[importAndFinalizeAsPlayer1] Player 1:', player1Address);
    console.log('[importAndFinalizeAsPlayer1] Player 2:', player2Address);

    // Log auth entries for debugging
    if (tx.simulationData?.result?.auth) {
      const authEntries = tx.simulationData.result.auth;
      console.log(`[importAndFinalizeAsPlayer1] Found ${authEntries.length} auth entries in simulation:`);
      for (let i = 0; i < authEntries.length; i++) {
        try {
          const entry = authEntries[i];
          const credentialType = entry.credentials().switch().name;
          if (credentialType === 'sorobanCredentialsAddress') {
            const entryAddress = entry.credentials().address().address();
            const entryAddressString = Address.fromScAddress(entryAddress).toString();
            console.log(`  [${i}] Address: ${entryAddressString}`);
          } else {
            console.log(`  [${i}] Type: ${credentialType}`);
          }
        } catch (err: any) {
          console.log(`  [${i}] Error reading entry:`, err.message);
        }
      }
    }

    // Calculate TTL
    const validUntilLedgerSeq = await calculateValidUntilLedger(RPC_URL, MULTI_SIG_AUTH_TTL_MINUTES);

    // Inject Player 2's signed auth entry
    // Note: injectSignedAuthEntry parameters are named for number-guess pattern,
    // but work generically:
    // - param1: the ALREADY SIGNED auth entry (from Player 2)
    // - param2: the CURRENT SIGNER's address (Player 1)
    // - param3: the CURRENT SIGNER's signing functions (Player 1)
    const txWithInjectedAuth = await injectSignedAuthEntry(
      tx,
      player2SignedAuthEntryXdr,  // Already signed auth entry from Player 2
      player1Address,              // Current signer is Player 1
      player1Signer,               // Player 1's signing functions
      validUntilLedgerSeq
    );

    console.log('[importAndFinalizeAsPlayer1] Injected Player 2 signed auth entry');

    // Create signing client and import the transaction
    const player1Client = this.createSigningClient(player1Address, player1Signer);
    const player1Tx = player1Client.txFromXDR(txWithInjectedAuth.toXDR());

    // Check if Player 1 needs to sign an auth entry
    const needsSigning = await player1Tx.needsNonInvokerSigningBy();
    console.log('[importAndFinalizeAsPlayer1] Accounts that still need to sign:', needsSigning);

    if (needsSigning.includes(player1Address)) {
      console.log('[importAndFinalizeAsPlayer1] Signing Player 1 auth entry');
      await player1Tx.signAuthEntries({ expiration: validUntilLedgerSeq });
    }

    // Re-simulate with all auth entries signed
    console.log('[importAndFinalizeAsPlayer1] Re-simulating with all auth entries signed');
    await player1Tx.simulate();

    // Sign transaction envelope and submit
    console.log('[importAndFinalizeAsPlayer1] Signing and submitting transaction');
    const sentTx = await signAndSendViaLaunchtube(
      player1Tx,
      DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
      validUntilLedgerSeq
    );

    console.log('[importAndFinalizeAsPlayer1] ✅ Transaction submitted successfully');
    return sentTx.result;
  }

  /**
   * STEP 2 ALTERNATIVE (Player 2): Import Player 1's auth entry and sign
   * (OLD METHOD - kept for backwards compatibility if needed)
   *
   * @deprecated Use prepareStartGameAsPlayer2 and importAndFinalizeAsPlayer1 instead
   */
  async importAndSignAuthEntry(
    player1SignedAuthEntryXdr: string,
    player2Address: string,
    player2Points: bigint,
    player2Signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): Promise<string> {
    const gameParams = this.parseAuthEntry(player1SignedAuthEntryXdr);

    if (player2Address === gameParams.playerAddress) {
      throw new Error('Cannot play against yourself');
    }

    const buildClient = new ZkTacticalMatchClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: player2Address,
    });

    const tx = await buildClient.start_game({
      session_id: gameParams.sessionId,
      player1: gameParams.playerAddress,
      player2: player2Address,
      player1_points: gameParams.playerPoints,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = await calculateValidUntilLedger(RPC_URL, MULTI_SIG_AUTH_TTL_MINUTES);

    const txWithInjectedAuth = await injectSignedAuthEntry(
      tx,
      player1SignedAuthEntryXdr,
      player2Address,
      player2Signer,
      validUntilLedgerSeq
    );

    const player2Client = this.createSigningClient(player2Address, player2Signer);
    const player2Tx = player2Client.txFromXDR(txWithInjectedAuth.toXDR());

    const needsSigning = await player2Tx.needsNonInvokerSigningBy();
    if (needsSigning.includes(player2Address)) {
      await player2Tx.signAuthEntries({ expiration: validUntilLedgerSeq });
    }

    return player2Tx.toXDR();
  }

  /**
   * STEP 3: Finalize and submit transaction
   */
  async finalizeStartGame(
    xdr: string,
    signerAddress: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ) {
    const client = this.createSigningClient(signerAddress, signer);
    const tx = client.txFromXDR(xdr);
    await tx.simulate();

    const validUntilLedgerSeq = await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);
    const sentTx = await signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds, validUntilLedgerSeq);
    return sentTx.result;
  }

  /**
   * Parse auth entry to extract game parameters (generic for any player)
   *
   * Auth entries from require_auth_for_args contain:
   * - Player address (from credentials)
   * - Session ID (arg 0)
   * - Player's points (arg 1)
   */
  private parseAuthEntry(authEntryXdr: string): {
    sessionId: number;
    playerAddress: string;
    playerPoints: bigint;
    functionName: string;
  } {
    try {
      const authEntry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, 'base64');

      // Extract player address from credentials
      const credentials = authEntry.credentials();
      const addressCreds = credentials.address();
      const playerScAddress = addressCreds.address();
      const playerAddress = Address.fromScAddress(playerScAddress).toString();

      // Get the root invocation and function
      const rootInvocation = authEntry.rootInvocation();
      const authorizedFunction = rootInvocation.function();
      const contractFn = authorizedFunction.contractFn();

      // Get function name
      const functionName = contractFn.functionName().toString();

      if (functionName !== 'start_game') {
        throw new Error(`Unexpected function: ${functionName}. Expected start_game.`);
      }

      // Extract arguments
      // For start_game with require_auth_for_args:
      // 0: session_id (u32)
      // 1: player_points (i128)
      const args = contractFn.args();

      if (args.length !== 2) {
        throw new Error(`Expected 2 arguments for start_game auth entry, got ${args.length}`);
      }

      const sessionId = args[0].u32();
      const playerPoints = args[1].i128().lo().toBigInt();

      console.log('[parseAuthEntry] Parsed:', {
        sessionId,
        playerAddress,
        playerPoints: playerPoints.toString(),
        functionName,
      });

      return {
        sessionId,
        playerAddress,
        playerPoints,
        functionName,
      };
    } catch (err: any) {
      console.error('[parseAuthEntry] Error parsing auth entry:', err);
      throw new Error(`Failed to parse auth entry: ${err.message}`);
    }
  }
}
