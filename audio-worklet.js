// Plays queued sample chunks and reports progress. Nothing else runs here.
class KgbOutput extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = []; // Float32Array, interleaved stereo
    this.offset = 0; // frames already consumed from chunks[0]
    this.consumed = 0; // total frames played from chunks
    this.underruns = 0;
    this.underrunning = false; // inside a run of underrun quanta
    this.quanta = 0;
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (this.stopped) return;
      if (e.data.type === "samples") this.chunks.push(e.data.data);
      else if (e.data.type === "stop") this.stopped = true;
    };
  }

  report() {
    this.port.postMessage({ type: "status", consumed: this.consumed, underruns: this.underruns });
  }

  process(_inputs, outputs) {
    const [left, right] = outputs[0];
    if (this.stopped) return true;
    let underran = false;
    for (let i = 0; i < left.length; i++) {
      const chunk = this.chunks[0];
      if (!chunk) {
        left[i] = 0;
        right[i] = 0;
        underran = true;
        continue;
      }
      left[i] = chunk[this.offset * 2];
      right[i] = chunk[this.offset * 2 + 1];
      this.consumed++;
      if (++this.offset * 2 >= chunk.length) {
        this.chunks.shift();
        this.offset = 0;
      }
    }
    if (underran) this.underruns++;
    // Report on entering an underrun, not on every quantum of it: an idle
    // page (no game yet) sits in underrun and would wake the main thread
    // ~375 times a second for nothing. The periodic report still runs.
    const entering = underran && !this.underrunning;
    this.underrunning = underran;
    if (entering || ++this.quanta % 8 === 0) this.report();
    return true;
  }
}

registerProcessor("kgb-output", KgbOutput);
