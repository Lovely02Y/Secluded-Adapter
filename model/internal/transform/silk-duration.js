'use strict';
import { isMainThread, parentPort, Worker, MessageChannel } from 'worker_threads';
import { encode as silkEncode, decode as silkDecode, getDuration as silkGetDuration } from 'silk-wasm';
import { readFileSync, unlink } from 'fs';

if (!isMainThread && parentPort) {
  parentPort.once('message', (val) => {
    const data = val.data;
    const port = val.port;
    const input = data.input || Buffer.alloc(0);

    if (data.file) {
      unlink(data.file, () => {});
    }

    switch (data.type) {
      case 'encode':
        silkEncode(input, data.sampleRate).then((ret) => {
          port.postMessage(ret);
          port.close();
        });
        break;
      case 'decode':
        silkDecode(input, data.sampleRate).then((ret) => {
          port.postMessage(ret);
          port.close();
        });
        break;
      case 'getDuration':
        port.postMessage(silkGetDuration(input, data.frameMs));
        port.close();
        break;
      default:
        port.postMessage({ data: null });
        port.close();
    }
  });
}

function postMessage(data) {
  const worker = new Worker(new URL(import.meta.url));
  const subChannel = new MessageChannel();
  const port = subChannel.port2;

  return new Promise((resolve) => {
    port.once('message', (ret) => {
      port.close();
      worker.terminate();
      resolve(ret);
    });
    worker.postMessage({ port: subChannel.port1, data: data }, [subChannel.port1]);
  });
}

function file(input) {
  if (typeof input === 'string') {
    input = readFileSync(input);
  }
  return input;
}

export function encode(input, sampleRate) {
  return postMessage({ type: 'encode', input: file(input), sampleRate });
}

export function decode(input, sampleRate) {
  return postMessage({ type: 'decode', input: file(input), sampleRate });
}

export function getDuration(input, frameMs) {
  return postMessage({ type: 'getDuration', input: file(input), frameMs });
}
