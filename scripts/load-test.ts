import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { io, type Socket } from 'socket.io-client';
import type { SerializedQuestionPatch, SerializedRoomPatch, SerializedState } from '../src/lib/types/game.js';

type LoadTestOptions = {
  baseUrl: string;
  origin: string;
  quizFilename: string;
  username?: string;
  password?: string;
  players: number;
  rampMs: number;
  answerSpreadMs: number;
  connectTimeoutMs: number;
  ackTimeoutMs: number;
  questionReadyTimeoutMs: number;
  finalStateTimeoutMs: number;
};

type AckResult<T> = {
  ack: T;
  ms: number;
};

type PercentileSummary = {
  count: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  avg: number;
};

type ErrorBuckets = Map<string, number>;

type SocketTracker = {
  label: string;
  socket: Socket;
  latestState: SerializedState | null;
  latestRoomPatch: SerializedRoomPatch | null;
  latestQuestionPatch: SerializedQuestionPatch | null;
  disconnects: number;
  finalUpdateSeenAt: number | null;
};

function printHelp(): void {
  console.log(`Usage: npm run load -- --base-url <url> [options]

Options:
  --base-url <url>               Target app URL. Default: http://localhost:3000
  --origin <origin>              Origin header for the socket handshake. Default: base-url origin
  --quiz-filename <file>         Quiz file for host:create. Default: test_quiz.yaml
  --username <name>              Host username when auth is configured
  --password <password>          Host password when auth is configured
  --players <count>              Number of players to join. Default: 25
  --ramp-ms <ms>                 Total join ramp duration. Default: 0
  --answer-spread-ms <ms>        Spread answer submissions across this duration. Default: 0
  --connect-timeout-ms <ms>      Socket connect timeout per client. Default: 10000
  --ack-timeout-ms <ms>          Ack timeout per event. Default: 10000
  --question-ready-timeout-ms <ms>
                                 Wait for Question state after host:start_question. Default: 10000
  --final-state-timeout-ms <ms>  Wait for host question patch to reach final submission count. Default: 15000
  --help                         Show this message

Notes:
  - Run the load generator from a separate machine for real capacity measurements.
  - For benchmark deployments, set LOAD_TEST_PLAYER_JOIN_MAX high enough on the app server
    so the per-IP join limiter does not dominate the result.
`);
}

function parseArgMap(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }
    args.set(key, next);
    i += 1;
  }
  return args;
}

function parsePositiveInt(raw: string | undefined, fallback: number, label: string): number {
  if (raw == null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

function getOptions(): LoadTestOptions {
  const args = parseArgMap(process.argv.slice(2));
  if (args.has('help')) {
    printHelp();
    process.exit(0);
  }

  const baseUrl = args.get('base-url') ?? process.env.LOAD_TEST_BASE_URL ?? 'http://localhost:3000';
  const parsedUrl = new URL(baseUrl);
  return {
    baseUrl: parsedUrl.toString().replace(/\/$/, ''),
    origin: args.get('origin') ?? process.env.LOAD_TEST_ORIGIN ?? parsedUrl.origin,
    quizFilename: args.get('quiz-filename') ?? process.env.LOAD_TEST_QUIZ_FILENAME ?? 'test_quiz.yaml',
    username: args.get('username') ?? process.env.LOAD_TEST_USERNAME,
    password: args.get('password') ?? process.env.LOAD_TEST_PASSWORD,
    players: parsePositiveInt(args.get('players') ?? process.env.LOAD_TEST_PLAYERS, 25, 'players'),
    rampMs: parsePositiveInt(args.get('ramp-ms') ?? process.env.LOAD_TEST_RAMP_MS, 0, 'ramp-ms'),
    answerSpreadMs: parsePositiveInt(
      args.get('answer-spread-ms') ?? process.env.LOAD_TEST_ANSWER_SPREAD_MS,
      0,
      'answer-spread-ms'
    ),
    connectTimeoutMs: parsePositiveInt(
      args.get('connect-timeout-ms') ?? process.env.LOAD_TEST_CONNECT_TIMEOUT_MS,
      10000,
      'connect-timeout-ms'
    ),
    ackTimeoutMs: parsePositiveInt(
      args.get('ack-timeout-ms') ?? process.env.LOAD_TEST_ACK_TIMEOUT_MS,
      10000,
      'ack-timeout-ms'
    ),
    questionReadyTimeoutMs: parsePositiveInt(
      args.get('question-ready-timeout-ms') ?? process.env.LOAD_TEST_QUESTION_READY_TIMEOUT_MS,
      10000,
      'question-ready-timeout-ms'
    ),
    finalStateTimeoutMs: parsePositiveInt(
      args.get('final-state-timeout-ms') ?? process.env.LOAD_TEST_FINAL_STATE_TIMEOUT_MS,
      15000,
      'final-state-timeout-ms'
    ),
  };
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[idx];
}

function summarize(values: number[]): PercentileSummary {
  if (values.length === 0) {
    return { count: 0, min: 0, p50: 0, p95: 0, max: 0, avg: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
    avg: total / sorted.length,
  };
}

function roundMs(value: number): number {
  return Number(value.toFixed(1));
}

function formatSummary(summary: PercentileSummary) {
  return {
    count: summary.count,
    min: roundMs(summary.min),
    p50: roundMs(summary.p50),
    p95: roundMs(summary.p95),
    avg: roundMs(summary.avg),
    max: roundMs(summary.max),
  };
}

function incrementBucket(buckets: ErrorBuckets, key: string): void {
  buckets.set(key, (buckets.get(key) ?? 0) + 1);
}

function createSocketClient(options: LoadTestOptions): Socket {
  return io(options.baseUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    withCredentials: true,
    extraHeaders: {
      Origin: options.origin,
    },
  });
}

async function waitForConnect(socket: Socket, timeoutMs: number): Promise<void> {
  if (socket.connected) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out connecting socket ${socket.id || '(pending)'}`));
    }, timeoutMs);
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };
    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

async function emitAck<T>(socket: Socket, event: string, payload: unknown, timeoutMs: number): Promise<AckResult<T>> {
  const startedAt = performance.now();
  return await new Promise<AckResult<T>>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack from ${event}`));
    }, timeoutMs);
    socket.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve({ ack, ms: performance.now() - startedAt });
    });
  });
}

function trackSocket(socket: Socket, label: string, errorBuckets: ErrorBuckets): SocketTracker {
  const tracker: SocketTracker = {
    label,
    socket,
    latestState: null,
    latestRoomPatch: null,
    latestQuestionPatch: null,
    disconnects: 0,
    finalUpdateSeenAt: null,
  };

  socket.on('state:update', (payload: { state: SerializedState }) => {
    tracker.latestState = payload?.state ?? null;
    tracker.latestQuestionPatch = null;
  });
  socket.on('room:patch', (payload: { patch?: SerializedRoomPatch }) => {
    tracker.latestRoomPatch = payload?.patch ?? null;
  });
  socket.on('question:patch', (payload: { patch?: SerializedQuestionPatch }) => {
    tracker.latestQuestionPatch = payload?.patch ?? null;
  });
  socket.on('disconnect', (reason) => {
    tracker.disconnects += 1;
    incrementBucket(errorBuckets, `disconnect:${reason}`);
  });
  socket.on('connect_error', (error) => {
    incrementBucket(errorBuckets, `connect_error:${error.message}`);
  });
  socket.on('error', (error) => {
    incrementBucket(errorBuckets, `socket_error:${String(error)}`);
  });

  return tracker;
}

async function waitForCondition(
  label: string,
  timeoutMs: number,
  predicate: () => boolean | Promise<boolean>
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function getCurrentQuestion(state: SerializedState | null) {
  if (!state) return null;
  return state.quiz.rounds[state.currentRoundIndex]?.questions[state.currentQuestionIndex] ?? null;
}

function countDisconnects(trackers: SocketTracker[]): number {
  return trackers.reduce((sum, tracker) => sum + tracker.disconnects, 0);
}

function safeDisconnect(socket: Socket): void {
  try {
    socket.removeAllListeners();
    socket.disconnect();
  } catch {
    /* ignore cleanup errors */
  }
}

async function main(): Promise<void> {
  const options = getOptions();
  const errorBuckets: ErrorBuckets = new Map();
  const cleanupSockets = new Set<Socket>();
  const playerTrackers: SocketTracker[] = [];
  let hostTracker: SocketTracker | null = null;

  console.log('Load test configuration');
  console.table([
    {
      baseUrl: options.baseUrl,
      origin: options.origin,
      quizFilename: options.quizFilename,
      players: options.players,
      rampMs: options.rampMs,
      answerSpreadMs: options.answerSpreadMs,
    },
  ]);

  try {
    const hostSocket = createSocketClient(options);
    cleanupSockets.add(hostSocket);
    hostTracker = trackSocket(hostSocket, 'host', errorBuckets);
    await waitForConnect(hostSocket, options.connectTimeoutMs);

    const createPayload = {
      quizFilename: options.quizFilename,
      username: options.username,
      password: options.password,
      waitingRoomEnabled: false,
      allowLateJoin: true,
    };
    const createResult = await emitAck<{ roomId?: string; state?: SerializedState; error?: string }>(
      hostSocket,
      'host:create',
      createPayload,
      options.ackTimeoutMs
    );
    if (createResult.ack?.error) {
      throw new Error(`host:create failed: ${createResult.ack.error}`);
    }
    if (!createResult.ack?.roomId) {
      throw new Error('host:create did not return a roomId');
    }
    hostTracker.latestState = createResult.ack.state ?? hostTracker.latestState;
    const roomId = createResult.ack.roomId;

    const joinLatencies: number[] = [];
    const joinErrors: string[] = [];
    const requestedPlayers = options.players;
    const joinDelayMs = requestedPlayers <= 1 ? 0 : Math.floor(options.rampMs / (requestedPlayers - 1));

    for (let index = 0; index < requestedPlayers; index += 1) {
      const playerSocket = createSocketClient(options);
      cleanupSockets.add(playerSocket);
      const tracker = trackSocket(playerSocket, `player-${index + 1}`, errorBuckets);
      playerTrackers.push(tracker);

      try {
        await waitForConnect(playerSocket, options.connectTimeoutMs);
        const joinResult = await emitAck<{
          roomId?: string;
          playerId?: string;
          state?: SerializedState;
          error?: string;
          message?: string;
          code?: string;
        }>(
          playerSocket,
          'player:join',
          {
            roomId,
            playerId: randomUUID(),
          },
          options.ackTimeoutMs
        );
        tracker.latestState = joinResult.ack?.state ?? tracker.latestState;
        if (joinResult.ack?.error || joinResult.ack?.code) {
          const reason =
            joinResult.ack?.message ?? joinResult.ack?.error ?? joinResult.ack?.code ?? 'Unknown join error';
          joinErrors.push(reason);
          incrementBucket(errorBuckets, `join:${reason}`);
          safeDisconnect(playerSocket);
        } else {
          joinLatencies.push(joinResult.ms);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        joinErrors.push(message);
        incrementBucket(errorBuckets, `join:${message}`);
        safeDisconnect(playerSocket);
      }

      if (joinDelayMs > 0 && index < requestedPlayers - 1) {
        await delay(joinDelayMs);
      }
    }

    const activePlayers = playerTrackers.filter((tracker) => tracker.socket.connected && tracker.latestState != null);
    if (activePlayers.length === 0) {
      throw new Error('No players joined successfully');
    }

    await emitAck<{ ok?: boolean; error?: string }>(hostSocket, 'host:start', {}, options.ackTimeoutMs);
    await emitAck<{ ok?: boolean; error?: string }>(hostSocket, 'host:start_question', {}, options.ackTimeoutMs);

    await waitForCondition(
      'host Question state',
      options.questionReadyTimeoutMs,
      () => hostTracker?.latestState?.type === 'Question'
    );

    const currentQuestion = getCurrentQuestion(hostTracker.latestState);
    if (!currentQuestion) {
      throw new Error('Could not determine current question');
    }
    if (currentQuestion.type !== 'choice' && currentQuestion.type !== 'true_false' && currentQuestion.type !== 'poll') {
      throw new Error(
        `First question must accept answerIndex for v1 load testing. Got ${currentQuestion.type}. Choose a quiz whose first question is choice/true_false/poll.`
      );
    }
    const optionCount = currentQuestion.type === 'true_false' ? 2 : currentQuestion.options.length;
    if (optionCount < 1) {
      throw new Error('Current question has no answer options');
    }

    hostTracker.finalUpdateSeenAt = null;
    for (const tracker of activePlayers) {
      tracker.finalUpdateSeenAt = null;
    }

    let expectedSubmissionCount = activePlayers.length;
    const burstStartedAt = Date.now();
    const markFinalUpdateIfReady = (tracker: SocketTracker) => {
      if (tracker.finalUpdateSeenAt != null) return;
      if (tracker.label === 'host') {
        if ((tracker.latestQuestionPatch?.submittedCount ?? 0) >= expectedSubmissionCount) {
          tracker.finalUpdateSeenAt = Date.now();
        }
        return;
      }
      if ((tracker.latestState?.submissions.length ?? 0) >= expectedSubmissionCount) {
        tracker.finalUpdateSeenAt = Date.now();
      }
    };

    const answerLatencies: number[] = [];
    const answerErrors: string[] = [];
    const spreadDivisor = Math.max(1, activePlayers.length - 1);

    await Promise.all(
      activePlayers.map(async (tracker, index) => {
        const spreadDelay =
          options.answerSpreadMs <= 0 ? 0 : Math.floor((index / spreadDivisor) * options.answerSpreadMs);
        if (spreadDelay > 0) {
          await delay(spreadDelay);
        }
        try {
          const answerResult = await emitAck<{ ok?: boolean; error?: string }>(
            tracker.socket,
            'player:answer',
            {
              questionId: currentQuestion.id,
              answerIndex: index % optionCount,
            },
            options.ackTimeoutMs
          );
          if (answerResult.ack?.error) {
            answerErrors.push(answerResult.ack.error);
            incrementBucket(errorBuckets, `answer:${answerResult.ack.error}`);
            return;
          }
          answerLatencies.push(answerResult.ms);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          answerErrors.push(message);
          incrementBucket(errorBuckets, `answer:${message}`);
        }
      })
    );

    expectedSubmissionCount = answerLatencies.length;
    if (expectedSubmissionCount === 0) {
      throw new Error('No answers were accepted');
    }

    await waitForCondition('host to observe final question patch', options.finalStateTimeoutMs, () => {
      markFinalUpdateIfReady(hostTracker);
      return hostTracker.finalUpdateSeenAt != null;
    });

    const propagationLatencies = [hostTracker]
      .map((tracker) => (tracker.finalUpdateSeenAt == null ? null : tracker.finalUpdateSeenAt - burstStartedAt))
      .filter((value): value is number => value != null);

    const counts = {
      requestedPlayers,
      joinedPlayers: joinLatencies.length,
      failedJoins: joinErrors.length,
      answeredPlayers: answerLatencies.length,
      failedAnswers: answerErrors.length,
      disconnects: countDisconnects([hostTracker, ...playerTrackers]),
      roomId,
      questionId: currentQuestion.id,
    };

    console.log('\nRun results');
    console.table([counts]);

    console.log('\nLatency summary (ms)');
    console.table([
      { metric: 'joinAck', ...formatSummary(summarize(joinLatencies)) },
      { metric: 'answerAck', ...formatSummary(summarize(answerLatencies)) },
      { metric: 'hostQuestionPatchSeen', ...formatSummary(summarize(propagationLatencies)) },
    ]);

    if (errorBuckets.size > 0) {
      console.log('\nError buckets');
      console.table(
        Array.from(errorBuckets.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([bucket, count]) => ({ bucket, count }))
      );
    }
  } finally {
    for (const socket of cleanupSockets) {
      safeDisconnect(socket);
    }
  }
}

void main().catch((error) => {
  console.error('\nLoad test failed');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
