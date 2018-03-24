;(function (global, factory) {
    var extract = function () {
        var ctx = {};
        factory.apply(ctx, arguments);
        return ctx.jpath;
    };

    if (typeof define === "function" && define.amd) {
        define("jpath", [], extract);
    } else if (typeof module === "object" && module.exports) {
        module.exports = extract();
    } else {
        global.jpath = extract();
    }
}(this || window, function () {

    var pathConst = Object.freeze({
        TRUE: "true",
        FALSE: "false",

        STEP: "/",
        NODE_SHORT: "*",
        AXIS: "::",
        // child:: сокращается полностью, то есть его можно вовсе опускать.
        // Выражение «/descendant-or-self::node()/» можно сокращать до «//».
        DESCENDANT_OR_SELF_SHORT: "/",
        // parent:: можно заменить на «..»
        PARENT_SHORT: "..",
        // self:: можно заменить на «.»
        SELF_SHORT: ".",

        CONDITION_BEGIN: "[",
        CONDITION_END: "]",
        FUNCTION_BEGIN: "(",
        FUNCTION_END: ")",
        NEXT_PARAM: ",",
        TEXT_BEGIN: "'",
        TEXT_END: "'",
        TEXT_SHIELD: "\\"
    });

    var axisConst = Object.freeze({
        // ancestor:: — Возвращает множество предков.
        // ancestor-or-self:: — Возвращает множество предков и текущий элемент.
        // child:: — Возвращает множество потомков на один уровень ниже. Это название сокращается полностью, то есть его можно вовсе опускать.
        CHILD: "child",
        // descendant:: — Возвращает полное множество потомков (то есть, как ближайших потомков, так и всех их потомков).
        DESCENDANT: "descendant",
        // descendant-or-self:: — Возвращает полное множество потомков и текущий элемент. Выражение «/descendant-or-self::node()/» можно сокращать до «//». С помощью этой оси, например, можно вторым шагом организовать отбор элементов с любого узла, а не только с корневого: достаточно первым шагом взять всех потомков корневого. Например, путь «//span» отберёт все узлы span документа, независимо от их положения в иерархии, взглянув как на имя корневого, так и на имена всех его дочерних элементов, на всю глубину их вложенности.
        DESCENDANT_OR_SELF: "descendant-or-self",
        // following:: — Возвращает множество элементов, расположенных ниже текущего элемента по дереву (на всех уровнях и слоях), исключая собственных потомков.
        // following-sibling:: — Возвращает множество братских элементов того же уровня, следующих за текущим слоем.
        // parent:: — Возвращает предка на один уровень назад. Это обращение можно заменить на «..»
        PARENT: "parent",
        // preceding:: — Возвращает множество элементов, расположенных выше текущего элемента по дереву (на всех уровнях и слоях), исключая множество собственных предков.
        // preceding-sibling:: — Возвращает множество братских элементов того же уровня, предшествующих текущему слою.
        // self:: — Возвращает текущий элемент. Это обращение можно заменить на «.»
        SELF: "self"
    });

    var functionInfoConst = Object.freeze({
        // узел
        node: new FunctionInfo("node", [], function () {
            return this;
        }),
        // название узла
        name: new FunctionInfo("name", [], function () {
            return this.name;
        }),
        // значение узла
        value: new FunctionInfo("value", [], function () {
            return this.value;
        }),
        boolean: new FunctionInfo("boolean", ["value"], function (value) {
            return toBoolean(value);
        }),
        number: new FunctionInfo("number", ["value"], function (value) {
            return toNumber(value);
        }),
        string: new FunctionInfo("string", ["value"], function (value) {
            return toString(value);
        }),
        // количество узлов
        count: new FunctionInfo("count", ["nodeSet"], function (nodeSet) {
            return nodeSet.length;
        }),
        // сумма значений узлов
        sum: new FunctionInfo("sum", ["nodeSet"], function (nodeSet) {
            var sum = 0;
            for (var index in nodeSet) {
                var value = nodeSet[index].value;
                if (typeof value === "number") sum += value;
                else throw "value " + value + " not a number"
            }
            return sum;
        })
    });

    var operatorUnaryConst = Object.freeze({
        NOT: {marker: "!", name: "not"},
        PLUS: {marker: "+", name: "plus"},
        MINUS: {marker: "-", name: "minus"}
    });

    var operatorBinaryConst = Object.freeze({
        EQUAL: {marker: "=", name: "equal"},
        NOT_EQUAL: {marker: "!=", name: "notEqual"},
        GREATER: {marker: ">", name: "greater "},
        GREATER_OR_EQUAL: {marker: ">=", name: "greaterOrEqual"},
        LESS: {marker: "<", name: "lessThan"},
        LESS_OR_EQUAL: {marker: "<=", name: "lessOrEqual"},

        AND: {marker: "and", name: "and"},
        OR: {marker: "or", name: "or"},

        ADDITION: {marker: "+", name: "addition"},
        SUBTRACTION: {marker: "-", name: "subtraction"},
        MULTIPLICATION: {marker: "*", name: "multiplication"},
        DIVISION: {marker: "div", name: "division"},
        MODULUS: {marker: "mod", name: "modulus"}
    });

    function toBoolean(value) {
        if (typeof value === "object") {
            if (value instanceof Node) return toBoolean(value.value);
            return true;
        }
        return Boolean(value);
    }

    function toNumber(value) {
        if (typeof value === "object") {
            // if ((value instanceof Node) && (typeof value.value !== "object")) return Number(value.value);
            if (value instanceof Node) return toNumber(value.value);
            throw "object can not convert to number";
        }
        return Number(value);
    }

    function toString(value) {
        if (typeof value === "object") {
            // if ((value instanceof Node) && (typeof value.value !== "object")) return String(value.value);
            if (value instanceof Node) return toString(value.value);
            throw "object can not convert to string";
        }
        return String(value);
    }

    function Cursor(text) {

        var pos = 0;

        function hasRead() {
            return pos < text.length;
        }

        function requireNonOutOfRange() {
            if (!hasRead()) throw "pos >= length";
        }

        Object.defineProperty(this, "pos", {
            get: function () {
                return pos;
            },
            set: function (value) {
                pos = value;
            }
        });
        Object.defineProperty(this, "requireNonOutOfRange", {value: requireNonOutOfRange});

        Object.defineProperty(this, "hasRead", {
            get: hasRead
        });
        Object.defineProperty(this, "next", {
            value: function () {
                return ++pos;
            }
        });
        Object.defineProperty(this, "readChar", {
            value: function () {
                requireNonOutOfRange();
                return text.charAt(pos);
            }
        });
        Object.defineProperty(this, "equals", {
            value: function (c) {
                this.requireNonOutOfRange();
                return c === text.charAt(pos);
            }
        });
        Object.preventExtensions(this);
    }

    function Constant(value) {
        Object.defineProperty(this, "value", {value: value});
        Object.preventExtensions(this);
    }

    function FunctionInfo(name, params, implementation) {
        if (typeof name !== "string") throw "unsupported type of name";
        if (!(params instanceof Array)) throw "unsupported type of params";
        if (typeof implementation !== "function") throw "unsupported type of implementation";
        Object.defineProperty(this, "name", {value: name});
        Object.defineProperty(this, "params", {value: params});
        Object.defineProperty(this, "run", {value: implementation});
        Object.preventExtensions(this);
    }

    function Function(info) {
        if (!(info instanceof FunctionInfo)) throw "unsupported type of info";
        var params = new Array();

        function paramIndex(name) {
            for (var index in info.params) if (info.params[index] === name) return index;
            throw "unknown name \"" + name + "\" of param";
        }

        function param(name, value) {
            var index = paramIndex(name);
            if (value === undefined) return params[index];
            else params[index] = value;
        }

        Object.defineProperty(this, "info", {value: info});
        Object.defineProperty(this, "params", {value: params});
        Object.defineProperty(this, "param", {value: param});
        Object.preventExtensions(this);
    }

    function Path() {
        Object.defineProperty(this, "steps", {value: new Array()});
        Object.preventExtensions(this);
    }

    function StepRoot() {
        Object.preventExtensions(this);
    }

    function StepContext(axis) {
        var fn;
        var conditions = new Array();
        Object.defineProperty(this, "axis", {value: axis});
        Object.defineProperty(this, "fn", {
            get: function () {
                return fn;
            },
            set: function (value) {
                fn = value;
            }
        });
        Object.defineProperty(this, "conditions", {value: conditions});
        Object.preventExtensions(this);
    }

    function OperatorBinary(operator, a, b) {
        Object.defineProperty(this, "operator", {value: operator});
        Object.defineProperty(this, "a", {value: a});
        Object.defineProperty(this, "b", {value: b});
    }

    function Node(name, parent, node, value, position) {
        Object.defineProperty(this, "name", {value: name});
        Object.defineProperty(this, "parent", {value: parent});
        Object.defineProperty(this, "node", {value: node});
        Object.defineProperty(this, "value", {value: value});
        Object.defineProperty(this, "position", {value: position});
        Object.preventExtensions(this);
    }

    function NodeSet() {
        var nodes = new Array();

        function add(node) {
            if (!(node instanceof Node)) return;
            for (var index in nodes) if (nodes[index] === node) return;
            nodes.push(node);
        }

        function addAll(nodes) {
            for (var index in nodes) add(nodes[index]);
        }

        Object.defineProperty(this, "nodes", {value: nodes});
        Object.defineProperty(this, "add", {value: add});
        Object.defineProperty(this, "addAll", {value: addAll});
    }

    function PathParser(path) {

        var cursor = new Cursor(path);

        function skipUnused() {
            while (cursor.hasRead) {
                if (cursor.readChar().charCodeAt(0) > 32) break;
                cursor.next();
            }
        }

        function isMarker(marker) {
            var pos = cursor.pos;
            for (var q = 0; q < marker.length; q++) {
                if (!cursor.hasRead || !cursor.equals(marker.charAt(q), pos)) {
                    cursor.pos = pos;
                    return false;
                }
                cursor.next();
            }
            return true;
        }

        function isAlphabetic(c) {
            return c.toLowerCase() != c.toUpperCase();
        }

        function isDigit(c) {
            return !isNaN(c);
        }

        function readName(required) {
            cursor.requireNonOutOfRange();
            var str = "";
            while (cursor.hasRead) {
                var c = cursor.readChar();
                if (str.length === 0 && !isAlphabetic(c)) break;
                if (!isAlphabetic(c) && !isDigit(c)) break;
                str += c;
                cursor.next();
            }
            if (str.length === 0) {
                if (required) throw "unexpected symbol '" + cursor.readChar() + "' at position " + cursor.pos;
                return;
            }
            return str;
        }

        function readConstantBoolean() {
            if (isMarker(pathConst.TRUE)) return new Constant(true);
            if (isMarker(pathConst.FALSE)) return new Constant(false);
            return;
        }

        function readConstantNumber() {
            var pos = cursor.pos;
            var str = "";
            var sign = false;
            if (isMarker("-")) {
                str += "-";
                sign = true;
            }
            var integer = false;
            if (isMarker("0")) {
                str += "0";
                integer = true;
            }
            else {
                while (cursor.hasRead) {
                    var c = cursor.readChar();
                    if (!isDigit(c)) break;
                    str += c;
                    cursor.next();
                    integer = true;
                }
            }
            var fractional = false;
            if (integer && isMarker(".")) {
                str += ".";
                while (cursor.hasRead) {
                    var c = cursor.readChar();
                    if (!isDigit(c)) break;
                    str += c;
                    cursor.next();
                    var fractional = true;
                }
                if (!fractional) {
                    if (cursor.hasRead) throw "unexpected symbol '" + cursor.readChar() + "' at position " + cursor.pos;
                    else throw "unexpected end of path";
                }
            }
            if (!integer && !fractional) {
                cursor.pos = pos;
                return;
            }
            return new Constant(Number(str));
        }

        function readConstantString() {
            if (!isMarker(pathConst.TEXT_BEGIN)) return;
            var str = "";
            while (true) {
                if (!cursor.hasRead) throw "unexpected end of text value";
                if (isMarker(pathConst.TEXT_END)) break;
                if (isMarker(pathConst.TEXT_SHIELD)) {
                    str += cursor.readChar();
                    cursor.next();
                    continue;
                }
                str += cursor.readChar();
                cursor.next();
            }
            return new Constant(str);
        }

        this.read = function () {
            var result = readOperation();
            skipUnused();
            if (cursor.hasRead) throw "unexpected symbol '" + cursor.readChar() + "' at position " + cursor.pos;
            return result;
        };

        function readPath() {
            var operationPath = new Path();
            if (isMarker(pathConst.STEP)) {
                operationPath.steps.push(new StepRoot());
                skipUnused();
            }
            while (cursor.hasRead) {
                var step = readStepContext();
                if (step === undefined) break;
                operationPath.steps.push(step);
                if (!cursor.hasRead || !isMarker(pathConst.STEP)) break;
            }
            return operationPath;
        }

        function readStepContext() {
            var step = readContextItem();
            if (step === undefined) return;
            while (cursor.hasRead) {
                var operation = readCondition();
                if (operation === undefined) break;
                step.conditions.push(operation);
            }
            return step;
        }

        function readOperatorBinary(operand) {
            for (var operatorIndex in operatorBinaryConst) {
                var operator = operatorBinaryConst[operatorIndex];
                if (isMarker(operator.marker)) return new OperatorBinary(operator, operand, readOperation());
            }
        }

        function readOperation() {
            skipUnused();
            var operation;
            operation = readConstant();
            if (operation === undefined) operation = readFunction();
            if (operation === undefined) operation = readPath();
            while (cursor.hasRead) {
                var pos = cursor.pos;
                skipUnused();
                var operator = readOperatorBinary(operation);
                if (operator == null) {
                    cursor.pos = pos;
                    break;
                }
                operation = operator;
            }
            return operation;
        }

        function readConstant() {
            var constant;
            constant = readConstantBoolean();
            if (constant !== undefined) return constant;
            constant = readConstantNumber();
            if (constant !== undefined) return constant;
            constant = readConstantString();
            if (constant !== undefined) return constant;
        }

        function readCondition() {
            skipUnused();
            if (!isMarker(pathConst.CONDITION_BEGIN)) return;
            var operation = readOperation();
            if (operation !== undefined && !isMarker(pathConst.CONDITION_END)) {
                throw "unexpected symbol " + cursor.readChar() + " at position " + cursor.pos;
            }
            return operation;
        }

        function readAxis() {
            var pos = cursor.pos;
            var name = readName(false);
            skipUnused();
            if (!isMarker(pathConst.AXIS)) {
                cursor.pos = pos;
                return;
            }
            for (var index in axisConst) {
                var axis = axisConst[index];
                if (axis === name) return axis;
            }
            throw "unsupported axis with name \"" + name + "\"";
        }

        function readNodeName() {
            return new Constant(readName(true));
        }

        function readFunction() {
            var pos = cursor.pos;
            var name = readName(false);
            skipUnused();
            if (!isMarker(pathConst.FUNCTION_BEGIN)) {
                cursor.pos = pos;
                return;
            }
            var info = functionInfoConst[name];
            if (info === undefined) throw "unsupported function with name \"" + name + "\"";
            var fn = new Function(info);
            do {
                var operation = readOperation();
                if (operation === undefined) break;
                fn.params.push(operation);
                skipUnused();
            } while (isMarker(pathConst.NEXT_PARAM));
            if (isMarker(pathConst.FUNCTION_END)) return fn;
            throw "unexpected symbol " + cursor.readChar() + " at position " + cursor.pos;
        }

        function readContextItem() {
            var pos = cursor.pos;
            var axis = readAxis();
            if (axis !== undefined) skipUnused();
            // parent:: || self::
            if (axisConst.PARENT === axis || axisConst.SELF === axis) {
                var stepContext = new StepContext(axis);
                stepContext.fn = readFunction();
                return stepContext;
            }
            // descendant:: || descendant-or-self::
            if (axisConst.DESCENDANT === axis || axisConst.DESCENDANT_OR_SELF === axis) {
                var stepContext = new StepContext(axis);
                stepContext.fn = readFunction();
                return stepContext;
            }
            // child::
            if (axisConst.CHILD === axis) {
                var stepContext = new StepContext(axis);
                stepContext.fn = readFunction();
                if (stepContext.fn === undefined) stepContext.fn = readName(true);
                return stepContext;
            }
            // ..
            if (isMarker(pathConst.PARENT_SHORT)) {
                var stepContext = new StepContext(axisConst.PARENT);
                stepContext.fn = new Function(functionInfoConst.node);
                return stepContext;
            }
            // .
            if (isMarker(pathConst.SELF_SHORT)) {
                var stepContext = new StepContext(axisConst.SELF);
                stepContext.fn = new Function(functionInfoConst.node);
                return stepContext;
            }
            // /
            if (isMarker(pathConst.DESCENDANT_OR_SELF_SHORT)) {
                var stepContext = new StepContext(axisConst.DESCENDANT_OR_SELF);
                stepContext.fn = new Function(functionInfoConst.node);
                cursor.pos = pos;
                return stepContext;
            }
            // *
            if (isMarker(pathConst.NODE_SHORT)) {
                var stepContext = new StepContext(axisConst.CHILD);
                stepContext.fn = new Function(functionInfoConst.node);
                return stepContext;
            }

            //
            var fn = readFunction();
            if (fn) {
                var stepContext = new StepContext(axisConst.SELF);// должно быть CHILD
                stepContext.fn = fn;
                return stepContext;
            }
            var name = readName(false);
            if (name) {
                var stepContext = new StepContext(axisConst.CHILD);
                stepContext.fn = name;
                return stepContext;
            }
        }
    }

    function PathPrinter(path) {

        var debug = true;

        this.print = function () {
            var printStream = {
                str: "", print: function (value) {
                    this.str += value;
                    return this;
                }
            };
            printOperation(printStream, path);
            return printStream.str;
        };

        function printOperation(printStream, operation) {
            if (operation instanceof Constant) {
                printConstant(printStream, operation);
                return;
            }
            if (operation instanceof Function) {
                printFunction(printStream, operation);
                return;
            }
            if (operation instanceof Path) {
                var first = true;
                for (var stepIndex in operation.steps) {
                    if (first) first = false;
                    else printStream.print(pathConst.STEP);
                    printStep(printStream, operation.steps[stepIndex]);
                }
                return;
            }
            if (operation instanceof OperatorBinary) {
                if (debug) {
                    printStream.print("operator_" + operation.operator.name + "(");
                    printOperation(printStream, operation.a);
                    printStream.print(pathConst.NEXT_PARAM).print(" ");
                    printOperation(printStream, operation.b);
                    printStream.print(")");
                } else {
                    printOperation(printStream, operation.a);
                    printStream.print(" ");
                    printStream.print(operation.operator.marker);
                    printStream.print(" ");
                    printOperation(printStream, operation.b);
                }
                return;
            }
            console.error("unsupported operation", operation);
            throw "unsupported operation " + operation;
        }

        function printConstant(printStream, constant) {
            switch (typeof constant.value) {
                case "boolean":
                    printStream.print(constant.value); //???
                    break;
                case "number":
                    printStream.print(constant.value);
                    break;
                case "string":
                    printStream.print(pathConst.TEXT_BEGIN);
                    printStream.print(constant.value);
                    printStream.print(pathConst.TEXT_END);
                    break;
                default:
                    throw "Unsupported constant " + constant.value;
            }
        }

        function printStep(printStream, step) {
            if (step instanceof StepRoot) return;
            if (step instanceof StepContext) {
                printStepContext(printStream, step, step.conditions.length != 0);
                for (var operationIndex in step.conditions) {
                    printStream.print(pathConst.CONDITION_BEGIN);
                    if (debug) printStream.print(" ");
                    printOperation(printStream, step.conditions[operationIndex]);
                    if (debug) printStream.print(" ");
                    printStream.print(pathConst.CONDITION_END);
                }
                return;
            }
        }

        function printStepContext(printStream, stepContext, condition) {
            if (!debug) {
                var fn = stepContext.fn;
                switch (stepContext.axis) {
                    case axisConst.PARENT:
                        if (fn.info === functionInfoConst.node) {
                            printStream.print(pathConst.PARENT_SHORT);
                            return;
                        }
                        break;
                    case axisConst.SELF:
                        if (fn.info === functionInfoConst.node) {
                            printStream.print(pathConst.SELF_SHORT);
                            return;
                        }
                        break;
                    case axisConst.CHILD:
                        if (typeof fn === "string") {
                            printStream.print(fn);
                            return;
                        }
                        if (fn.info === functionInfoConst.node) {
                            printStream.print(pathConst.NODE_SHORT);
                            return;
                        }
                        break;
                    default:
                        throw "Unsupported " + stepContext.axis;
                }
            }
            printStream.print(stepContext.axis);
            printStream.print(pathConst.AXIS);
            printFunction(printStream, stepContext.fn);
        }

        function printFunction(printStream, fn) {
            if (typeof fn === "string") {
                printStream.print(fn);
                return;
            }
            if (fn instanceof Function) {
                printStream.print(fn.info.name);
                printStream.print(pathConst.FUNCTION_BEGIN);
                for (var index in fn.params) {
                    if (index > 0) printStream.print(pathConst.NEXT_PARAM).print(" ");
                    printOperation(printStream, fn.params[index]);
                }
                printStream.print(pathConst.FUNCTION_END);
                return;
            }
            console.error("function", fn);
            throw "function " + fn.info;
        }
    }

    function DataModel(jsonData) {

        this.convert = function () {
            return toDataModel();
        }

        function toDataModel() {
            if (jsonData.data === undefined) throw "unknown format data model. version not found";
            if (jsonData.version !== "1.0") throw "unknown version " + jsonData.version + " data model. available version 1.0";
            if (jsonData.data === undefined) throw "unknown format data model. data not found";
            return toNode(null, null, jsonData.data, null);
        }

        function toNode(name, parent, data, position) {
            if (typeof data === "object") {
                if (data instanceof Array) {
                    var array = [];
                    for (var index in data) array.push(toNode(name, parent, data[index], Number(index) + 1));
                    return array;
                } else {
                    var node = new Node(name, parent, data, {}, position);
                    for (var key in data) node.value[key] = toNode(key, node, data[key], null);
                    return node;
                }
            } else {
                return new Node(name, parent, data, data, position);
            }
        }
    }

    function PathProcessor(path, dataModel) {

        this.process = function () {
            return processOperation(getRootNode(), path);
        };

        function getRootNode() {
            return dataModel;
        }

        function processOperation(node, operation) {
            if (operation instanceof Constant) return processConstant(operation);
            if (operation instanceof Function) return processFunction(node, operation);
            if (operation instanceof Path) return processPath(node, operation);
            if (operation instanceof OperatorBinary) return processOperatorBinary(node, operation);
            throw "unsupported operation" + operation;
        }

        function processConstant(constant) {
            switch (typeof constant.value) {
                case "boolean":
                    return constant.value;
                case "number":
                    return constant.value;
                case "string":
                    return constant.value;
                default:
                    throw "unsupported constant " + constant.value;
            }
        }

        function processFunction(node, fn) {
            // console.log("run function", fn.info.name, fn, node);
            var params = [];
            for (var index in fn.params) params.push(processOperation(node, fn.params[index]));
            var result = fn.info.run.apply(node, params);
            // console.log("function result", fn.info.name, result);
            return result;
        }

        function processPath(node, path) {
            var nodeSet = new NodeSet();
            nodeSet.add(node);
            for (var stepIndex in path.steps) {
                var result = processStep(path.steps[stepIndex], nodeSet);
                if (result instanceof NodeSet) nodeSet = result;
                else return result;
            }
            return nodeSet.nodes;
        }

        function processStep(step, nodeSet) {
            if (step instanceof StepRoot) return processStepRoot();
            if (step instanceof StepContext) return processStepContext(step, nodeSet);
        }

        function processStepRoot() {
            var nodeSet = new NodeSet();
            nodeSet.add(getRootNode());
            return nodeSet;
        }

        function processStepContext(step, nodeSet) {
            var result;
            switch (step.axis) {
                case axisConst.PARENT:
                    result = processParent(step.fn, nodeSet.nodes);
                    break;
                case axisConst.SELF:
                    result = processSelf(step.fn, nodeSet.nodes);
                    break;
                case axisConst.CHILD:
                    result = processChild(step.fn, nodeSet.nodes);
                    break;
                case axisConst.DESCENDANT:
                    result = processDescendant(step.fn, nodeSet.nodes);
                    break;
                case axisConst.DESCENDANT_OR_SELF:
                    result = processDescendantOrSelf(step.fn, nodeSet.nodes);
                    break;
                default:
                    throw "unsupported axis " + step.axis;
            }
            if (result instanceof NodeSet && step.conditions.length > 0) {
                var filtered = new NodeSet();
                var index = 1;
                for (var nodeIndex in result.nodes) {
                    var node = result.nodes[nodeIndex];
                    if (processConditions(node, index++, step.conditions)) filtered.add(node);
                }
                return filtered;
            } else {
                return result;
            }
        }

        function processConditions(node, index, conditions) {
            for (var conditionIndex in conditions) {
                var result = processOperation(node, conditions[conditionIndex]);
                if (typeof result === "number" && result !== index) return false;
                if (!result) return false;
            }
            return true;
        }

        function run(fn, nodeSet) {
            var array = [];
            for (var nodeIndex in nodeSet.nodes) array.push(processFunction(nodeSet.nodes[nodeIndex], fn));
            return array;
        }

        function processParent(fn, nodes) {
            if (fn instanceof Function) {
                var nodeSet = new NodeSet;
                for (var nodeIndex in nodes) nodeSet.add(nodes[nodeIndex].parent);
                return run(fn, nodeSet);
            }
            console.error("Unsupported parent function", fn);
            throw "Unsupported parent function " + fn;
        }

        function processSelf(fn, nodes) {
            if (fn instanceof Function) {
                var nodeSet = new NodeSet;
                for (var nodeIndex in nodes) nodeSet.add(nodes[nodeIndex]);
                return run(fn, nodeSet);
            }
            console.error("Unsupported self function", fn);
            throw "Unsupported self function " + fn;
        }

        function processChild(fn, nodes) {
            if (typeof fn === "string") {
                var nodeSet = new NodeSet;
                for (var nodeIndex in nodes) nodeSet.addAll(getNodesByName(nodes[nodeIndex], fn).nodes);
                return nodeSet;
            }
            if (fn instanceof Function) {
                var nodeSet = new NodeSet;
                for (var nodeIndex in nodes) nodeSet.addAll(getChildNodes(nodes[nodeIndex]).nodes);
                return run(fn, nodeSet);
            }
            console.error("Unsupported child function", fn);
            throw "Unsupported child function " + fn;
        }

        function processDescendant(fn, nodes) {
            if (fn instanceof Function) {
                var nodeSet = new NodeSet;
                for (var nodeIndex in nodes) nodeSet.addAll(getDescendant(nodes[nodeIndex]).nodes);
                return run(fn, nodeSet);
            }
            console.error("Unsupported descendant or self function", fn);
            throw "Unsupported descendant or self function " + fn;
        }

        function processDescendantOrSelf(fn, nodes) {
            if (fn instanceof Function) {
                var nodeSet = new NodeSet;
                for (var nodeIndex in nodes) {
                    nodeSet.add(nodes[nodeIndex]);
                    nodeSet.addAll(getDescendant(nodes[nodeIndex]).nodes);
                }
                return run(fn, nodeSet);
            }
            console.error("Unsupported descendant or self function", fn);
            throw "Unsupported descendant or self function " + fn;
        }

        function getChildNodes(node) {
            if (typeof node.value === "object") {
                var nodeSet = new NodeSet;
                for (var key in node.value) {
                    var item = node.value[key];
                    if (item instanceof Array) for (var index in item) nodeSet.add(item[index]);
                    else nodeSet.add(item);
                }
                return nodeSet;
            } else return [node.value];
        }

        function getDescendant(node) {
            if (typeof node.value === "object") {
                var nodeSet = new NodeSet;
                for (var key in node.value) {
                    var item = node.value[key];
                    if (item instanceof Array) {
                        for (var index in item) {
                            nodeSet.add(item[index]);
                            nodeSet.addAll(getDescendant(item[index]).nodes);
                        }
                    } else {
                        nodeSet.add(item);
                        nodeSet.addAll(getDescendant(item).nodes);
                    }
                }
                return nodeSet;
            } else {
                return [node.value];
            }
        }

        function getNodesByName(node, name) {
            var nodeSet = new NodeSet;
            if (typeof node.value === "object") {
                var found = node.value[name];
                if (found instanceof Array) nodeSet.addAll(found);
                else nodeSet.add(found);
            }
            return nodeSet;
        }

        function processOperatorBinary(node, operation) {
            var a = processOperation(node, operation.a);
            var b = processOperation(node, operation.b);
            if (typeof a === "object" && typeof b === "object") {
                for (var aIndex in a) {
                    var aValue = a[aIndex].value;
                    for (var bIndex in b) {
                        var bValue = b[bIndex].value;
                        var result = operatorBinary(operation.operator, aValue, bValue);
                        if (result) return result;
                    }
                }
                return false;
            }
            if (typeof a === "object") {
                for (var aIndex in a) {
                    var aValue = a[aIndex].value;
                    var result = operatorBinary(operation.operator, aValue, b);
                    if (result) return result;
                }
                return false;
            }
            if (typeof b === "object") {
                for (var aIndex in b) {
                    var bValue = b[bIndex].value;
                    var result = operatorBinary(operation.operator, a, bValue);
                    if (result) return result;
                }
            }
            return operatorBinary(operation.operator, a, b);
        }

        function operatorBinary(operator, a, b) {
            switch (operator) {
                case operatorBinaryConst.EQUAL:
                    return a === b;
                case operatorBinaryConst.NOT_EQUAL:
                    return a !== b;
                case operatorBinaryConst.GREATER:
                    return a > b;
                case operatorBinaryConst.GREATER_OR_EQUAL:
                    return a >= b;
                case operatorBinaryConst.LESS:
                    return a < b;
                case operatorBinaryConst.LESS_OR_EQUAL:
                    return a <= b;

                case operatorBinaryConst.AND:
                    return toBoolean(a) && toBoolean(b);
                case operatorBinaryConst.OR:
                    return toBoolean(a) || toBoolean(b);

                case operatorBinaryConst.ADDITION:
                    return a + b;
                case operatorBinaryConst.SUBTRACTION:
                    return a - b;
                case operatorBinaryConst.MULTIPLICATION:
                    return a * b;
                case operatorBinaryConst.DIVISION:
                    return a / b;
                case operatorBinaryConst.MODULUS:
                    return a % b;

                default:
                    throw "unsupported binary operator " + operator.name;
            }
        }
    }

    function getPath(node) {
        var path;
        if (!(node.parent instanceof Node)) return [];
        path = getPath(node.parent);
        var item = {name: node.name};
        if (node.position !== null) item.position = node.position;
        path.push(item);
        return path;
    }

    function prepareResult(result) {
        if (result instanceof Array) {
            var array = [];
            for (var index in result) {
                var item = result[index];
                if (item instanceof Node) {
                    if (typeof item.value === "object") {
                        array.push({type: "node", name: item.name, value: item.node, path: getPath(item)});
                    }
                    else {
                        array.push({type: "value", name: item.name, value: item.node, path: getPath(item)});
                    }
                } else {
                    array.push({type: "result", value: item});
                }
            }
            return array;
        } else {
            return result;
        }
    }

    function printParsedPath(path) {
        if (!path) return;
        var pathData = new PathParser(path).read();
        return new PathPrinter(pathData).print();
    };


    function evaluate(jsonData, path) {
        if (!path) return;
        var dataModel = new DataModel(jsonData).convert();
        // console.log("dataModel:", dataModel);
        // console.log("path:", path);
        var pathData = new PathParser(path).read();
        // console.log(pathData);
        console.log("path:", new PathPrinter(pathData).print());
        var result = new PathProcessor(pathData, dataModel).process();
        // console.log("result:", result);
        return prepareResult(result);
    };

    function resume(result) {
        if (result === undefined) return {done: false};
        if (result === null) return {done: false};
        if (typeof result === "object") {
            if (result instanceof Array) {
                var data = {done: result.length > 0, paths: []};
                for (var index in result) data.paths.push(result[index].path);
                return data;
            }
            return {done: true};
        } else {
            if (typeof result === "boolean") return {done: result};
            return {done: true};
        }
    }

    function JPath() {
        Object.defineProperty(this, "printParsedPath", {value: printParsedPath});
        Object.defineProperty(this, "evaluate", {value: evaluate});
        Object.defineProperty(this, "resume", {value: resume});
        Object.preventExtensions(this);
    }

    this.jpath = new JPath();

}));
/*

var jsonData = {
    version: "1.0",
    data: {
        ResponseElement1: {
            INNElement1: "2208007591",
            KPPElement1: "220801001",
            FormingDateElement1: "2017-01-01T00:00:00+03:00",
            StatusElement1: {
                CodeElement3: "1",
                NameElement3: "Ответ готов"
            },
            ResponseIdElement1: "responseid",
            RequestIdElement1: "requestid",
            LicenseElement1: [
                {
                    NumberElement1: "ФС-22-01-001527",
                    DateElement1: "2013-03-22",
                    ObjectElement1: []
                },
                {
                    NumberElement1: "ФС-22-01-001528",
                    DateElement1: "2013-03-22",
                    ObjectElement1: []
                }
            ]
        },
        Numbers: {
            a: 1,
            b: 2,
            c: 3
        }
    }
};
// var path = "123";
// var path = ".";
// var path = "/ResponseElement1/LicenseElement1/..";
// var path = "/ResponseElement1/LicenseElement1/NumberElement1";
// var path = "/ResponseElement1/LicenseElement1/NumberElement1='ФС-22-01-001527'";
var path = "/ResponseElement1/LicenseElement1/NumberElement1[.='ФС-22-01-001527']";
// var path = "sum(/Numbers/*) > 30";

var result = jpath.evaluate(jsonData, path);

console.log("JPath result:", result);

console.log("prepared result:", jpath.resume(result));
*/