class Vertex {
    update: (v: Vertex[]) => boolean;

    constructor(update: (v: Vertex[]) => boolean) {
        this.update = update;
    }

    static roots: Vertex[] = [];

    static update(v: Vertex[]) {
        for (var root of Vertex.roots) {
            root.update(v);
        }
    }
}

class Transaction {
    static depth: number = 0;
    static vertexSinksChanged: Vertex[] = [];
    static posts: Array<()=>void> = new Array<()=>void>();

    static run<A>(fn: () => A): A {
        Transaction.depth++;
        let r = fn();
        Transaction.depth--;
        if (Transaction.depth == 0) {
            Vertex.update(Transaction.vertexSinksChanged);
            Transaction.vertexSinksChanged = [];
            for (var post of Transaction.posts) {
                post();
            }
            Transaction.posts = [];
        }
        return r;
    }

    static post(fn: () => void) {
        Transaction.posts.push(fn);
    }
}

class Stream<A> {
    vertex: Vertex;
    firing?: A;

    constructor(update: (v: Vertex[]) => boolean) {
        this.vertex = new Vertex(update);
        this.firing = null;
    }

    public map<B>(fn: (a: A) => B): Stream<B> {
        return new MapStream(this, fn);
    }

    public filter(pred: (a: A) => boolean): Stream<A> {
        return new FilterStream(this, pred);
    }

    public listen(handler: (a: A) => void): () => void {
        let root = new ListenStream(this, handler).vertex;
        Vertex.roots.push(root);
        return () => {
            var idx = Vertex.roots.indexOf(root);
            if (idx != -1) {
                Vertex.roots.splice(idx, 1);
            }
        };
    }
}

class StreamSink<A> extends Stream<A> {
    public constructor() {
        super(
            (v: Vertex[]) => v.indexOf(this.vertex) != -1
        );
    }

    public send(a: A) {
        Transaction.run(() => {
            this.firing = a;
            Transaction.vertexSinksChanged.push(this.vertex);
        });
        Transaction.post(() => this.firing = null);
    }
}

class MapStream<A,B> extends Stream<B> {
    constructor(str: Stream<A>, fn: (a: A) => B) {
        super(
            (v: Vertex[]) => {
                var changed = (str.vertex.update)(v);
                if (changed) {
                    if (str.firing != null) {
                        this.firing = fn(str.firing);
                        Transaction.post(() => this.firing = null);
                    } else {
                        this.firing = null;
                    }
                }
                return changed;
            }
        );
    }
}

class FilterStream<A> extends Stream<A> {
    constructor(str: Stream<A>, pred: (a: A) => boolean) {
        super(
            (v: Vertex[]) => {
                var changed = (str.vertex.update)(v);
                if (changed) {
                    if (str.firing != null) {
                        if (pred(str.firing)) {
                            this.firing = str.firing;
                            Transaction.post(() => this.firing = null);
                        } else if (this.firing == null) {
                            return false;
                        }
                    } else {
                        this.firing = null;
                    }
                }
                return changed;
            }
        );
    }
}

class ListenStream<A> extends Stream<A> {
    constructor(str: Stream<A>, handler: (a: A) => void) {
        super(
            (v: Vertex[]) => {
                var changed = (str.vertex.update)(v);
                if (changed && str.firing != null) {
                    handler(str.firing);
                }
                return changed;
            }
        );
    }
}

var sa = new StreamSink<number>();
var sb = sa.map(x => x * 3);
var sc = sb.filter(x => (x & 1) == 0);
var l = sc.listen(x => {
    console.log(x);
});
sa.send(1);
sa.send(2);
sa.send(3);
sa.send(4);
sa.send(5);
