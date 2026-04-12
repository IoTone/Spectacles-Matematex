// Copyright (c) 2026 IoTone, Inc. MIT/X License — see LICENSE.txt
//
// SpaceDOM — A pure TypeScript DOM implementation for Lens Studio (Snap Spectacles).
//
// Constraints:
//   - ES2021, CommonJS, isolatedModules: true
//   - No lib.dom.d.ts (explicitly excluded)
//   - No const enum (isolatedModules forbids it)
//   - No Node.js built-ins
//   - All classes exported from one file
//
// This module provides a minimal but spec-compliant DOM tree, suitable for
// server-side or embedded rendering pipelines that need a lightweight DOM
// without a browser environment.

// ---------------------------------------------------------------------------
// Node-type constants (plain numbers — isolatedModules forbids const enum)
// ---------------------------------------------------------------------------

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const COMMENT_NODE = 8;
export const DOCUMENT_NODE = 9;
export const DOCUMENT_FRAGMENT_NODE = 11;

// ---------------------------------------------------------------------------
// SpaceDOMException
// ---------------------------------------------------------------------------

/**
 * Lightweight Error subclass that mirrors the DOMException interface.
 * Only the `name` property is significant; numeric codes are not provided.
 */
export class SpaceDOMException extends Error {
  override name: string;

  constructor(message: string, name: string = 'Error') {
    super(message);
    this.name = name;
    // Maintain proper prototype chain for instanceof checks.
    Object.setPrototypeOf(this, SpaceDOMException.prototype);
  }
}

// ---------------------------------------------------------------------------
// Forward declarations (parser hook)
// ---------------------------------------------------------------------------

/**
 * Signature of the HTML parser function that SpaceDOMParser registers.
 * It receives raw HTML and a context document, and returns an array of
 * child nodes to insert.
 */
type ParseHTMLFn = (html: string, ownerDocument: SpaceDocument) => SpaceNode[];

let _parseHTML: ParseHTMLFn | null = null;

/**
 * Called by an external SpaceDOMParser module to register its parse function.
 */
export function _registerParser(parseFn: ParseHTMLFn): void {
  _parseHTML = parseFn;
}

// ---------------------------------------------------------------------------
// SpaceNodeList
// ---------------------------------------------------------------------------

/**
 * A live wrapper around a SpaceNode[] reference.  Mirrors the NodeList
 * interface with indexed access, length, item(), forEach(), and iteration.
 */
export class SpaceNodeList {
  /** The backing array — kept as a reference so that the list is live. */
  private _nodes: SpaceNode[];

  constructor(nodes: SpaceNode[]) {
    this._nodes = nodes;
  }

  get length(): number {
    return this._nodes.length;
  }

  item(index: number): SpaceNode | null {
    return index >= 0 && index < this._nodes.length ? this._nodes[index] : null;
  }

  forEach(callback: (node: SpaceNode, index: number, list: SpaceNodeList) => void): void {
    for (let i = 0; i < this._nodes.length; i++) {
      callback(this._nodes[i], i, this);
    }
  }

  [Symbol.iterator](): Iterator<SpaceNode> {
    let idx = 0;
    const nodes = this._nodes;
    return {
      next(): IteratorResult<SpaceNode> {
        if (idx < nodes.length) {
          return { value: nodes[idx++], done: false };
        }
        return { value: undefined as any, done: true };
      },
    };
  }
}

// ---------------------------------------------------------------------------
// SpaceHTMLCollection
// ---------------------------------------------------------------------------

/**
 * An array-based snapshot collection of SpaceElement nodes.
 */
export class SpaceHTMLCollection {
  private _elements: SpaceElement[];

  constructor(elements: SpaceElement[]) {
    this._elements = elements;
  }

  get length(): number {
    return this._elements.length;
  }

  item(index: number): SpaceElement | null {
    return index >= 0 && index < this._elements.length ? this._elements[index] : null;
  }

  /**
   * Returns the first element whose `id` or `name` attribute equals the
   * supplied string, or null if none match.
   */
  namedItem(name: string): SpaceElement | null {
    for (const el of this._elements) {
      if (el.getAttribute('id') === name || el.getAttribute('name') === name) {
        return el;
      }
    }
    return null;
  }

  [Symbol.iterator](): Iterator<SpaceElement> {
    let idx = 0;
    const elements = this._elements;
    return {
      next(): IteratorResult<SpaceElement> {
        if (idx < elements.length) {
          return { value: elements[idx++], done: false };
        }
        return { value: undefined as any, done: true };
      },
    };
  }
}

// ---------------------------------------------------------------------------
// SpaceAttr
// ---------------------------------------------------------------------------

/**
 * Represents a single attribute on an element.  Mirrors the Attr interface.
 */
export class SpaceAttr {
  name: string;
  value: string;
  namespaceURI: string | null;
  prefix: string | null;
  localName: string;
  specified: boolean = true;

  /** Set internally by SpaceElement when the attr is attached/detached. */
  _ownerElement: SpaceElement | null = null;

  constructor(
    name: string,
    value: string = '',
    namespaceURI: string | null = null,
    prefix: string | null = null,
  ) {
    this.name = name;
    this.value = value;
    this.namespaceURI = namespaceURI;
    this.prefix = prefix;

    // Derive localName from qualified name (strip prefix).
    const colonIdx = name.indexOf(':');
    this.localName = colonIdx >= 0 ? name.substring(colonIdx + 1) : name;
  }

  get ownerElement(): SpaceElement | null {
    return this._ownerElement;
  }
}

// ---------------------------------------------------------------------------
// SpaceNamedNodeMap
// ---------------------------------------------------------------------------

/**
 * A live view over an element's attribute list.
 */
export class SpaceNamedNodeMap {
  /** Direct reference to the owning element's _attrs array. */
  private _attrs: SpaceAttr[];

  constructor(attrs: SpaceAttr[]) {
    this._attrs = attrs;
  }

  get length(): number {
    return this._attrs.length;
  }

  item(index: number): SpaceAttr | null {
    return index >= 0 && index < this._attrs.length ? this._attrs[index] : null;
  }

  getNamedItem(qualifiedName: string): SpaceAttr | null {
    for (const attr of this._attrs) {
      if (attr.name === qualifiedName) {
        return attr;
      }
    }
    return null;
  }

  getNamedItemNS(namespaceURI: string | null, localName: string): SpaceAttr | null {
    for (const attr of this._attrs) {
      if (attr.namespaceURI === namespaceURI && attr.localName === localName) {
        return attr;
      }
    }
    return null;
  }

  setNamedItem(attr: SpaceAttr): SpaceAttr | null {
    for (let i = 0; i < this._attrs.length; i++) {
      if (this._attrs[i].name === attr.name) {
        const old = this._attrs[i];
        old._ownerElement = null;
        this._attrs[i] = attr;
        return old;
      }
    }
    this._attrs.push(attr);
    return null;
  }

  setNamedItemNS(attr: SpaceAttr): SpaceAttr | null {
    for (let i = 0; i < this._attrs.length; i++) {
      if (
        this._attrs[i].namespaceURI === attr.namespaceURI &&
        this._attrs[i].localName === attr.localName
      ) {
        const old = this._attrs[i];
        old._ownerElement = null;
        this._attrs[i] = attr;
        return old;
      }
    }
    this._attrs.push(attr);
    return null;
  }

  removeNamedItem(qualifiedName: string): SpaceAttr {
    for (let i = 0; i < this._attrs.length; i++) {
      if (this._attrs[i].name === qualifiedName) {
        const removed = this._attrs.splice(i, 1)[0];
        removed._ownerElement = null;
        return removed;
      }
    }
    throw new SpaceDOMException(
      `No attribute named '${qualifiedName}'`,
      'NotFoundError',
    );
  }

  removeNamedItemNS(namespaceURI: string | null, localName: string): SpaceAttr {
    for (let i = 0; i < this._attrs.length; i++) {
      if (
        this._attrs[i].namespaceURI === namespaceURI &&
        this._attrs[i].localName === localName
      ) {
        const removed = this._attrs.splice(i, 1)[0];
        removed._ownerElement = null;
        return removed;
      }
    }
    throw new SpaceDOMException(
      `No attribute with ns='${namespaceURI}' localName='${localName}'`,
      'NotFoundError',
    );
  }

  [Symbol.iterator](): Iterator<SpaceAttr> {
    let idx = 0;
    const attrs = this._attrs;
    return {
      next(): IteratorResult<SpaceAttr> {
        if (idx < attrs.length) {
          return { value: attrs[idx++], done: false };
        }
        return { value: undefined as any, done: true };
      },
    };
  }
}

// ---------------------------------------------------------------------------
// SpaceNode (base class)
// ---------------------------------------------------------------------------

/**
 * Abstract base for every node in the DOM tree.
 */
export class SpaceNode {
  // Static constants mirroring the module-level values.
  static readonly ELEMENT_NODE = ELEMENT_NODE;
  static readonly TEXT_NODE = TEXT_NODE;
  static readonly COMMENT_NODE = COMMENT_NODE;
  static readonly DOCUMENT_NODE = DOCUMENT_NODE;
  static readonly DOCUMENT_FRAGMENT_NODE = DOCUMENT_FRAGMENT_NODE;

  readonly nodeType: number;
  readonly nodeName: string;

  _parentNode: SpaceNode | null = null;
  _childNodes: SpaceNode[] = [];
  _previousSibling: SpaceNode | null = null;
  _nextSibling: SpaceNode | null = null;
  _ownerDocument: SpaceDocument | null = null;

  constructor(nodeType: number, nodeName: string) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
  }

  // -- Getters (read-only DOM properties) ----------------------------------

  get parentNode(): SpaceNode | null {
    return this._parentNode;
  }

  /**
   * Returns the parent if it is an element; otherwise null.
   */
  get parentElement(): SpaceElement | null {
    if (this._parentNode && this._parentNode.nodeType === ELEMENT_NODE) {
      return this._parentNode as SpaceElement;
    }
    return null;
  }

  /**
   * Returns a *live* SpaceNodeList wrapping this node's _childNodes array.
   */
  get childNodes(): SpaceNodeList {
    return new SpaceNodeList(this._childNodes);
  }

  get firstChild(): SpaceNode | null {
    return this._childNodes.length > 0 ? this._childNodes[0] : null;
  }

  get lastChild(): SpaceNode | null {
    return this._childNodes.length > 0
      ? this._childNodes[this._childNodes.length - 1]
      : null;
  }

  get previousSibling(): SpaceNode | null {
    return this._previousSibling;
  }

  get nextSibling(): SpaceNode | null {
    return this._nextSibling;
  }

  get ownerDocument(): SpaceDocument | null {
    return this._ownerDocument;
  }

  // -- nodeValue ------------------------------------------------------------

  get nodeValue(): string | null {
    // Element, Document, DocumentFragment => null
    // Text, Comment => delegated in subclass
    return null;
  }

  set nodeValue(_value: string | null) {
    // Default: no-op for Element, Document, DocumentFragment
  }

  // -- textContent ----------------------------------------------------------

  get textContent(): string | null {
    switch (this.nodeType) {
      case ELEMENT_NODE:
      case DOCUMENT_FRAGMENT_NODE: {
        let result = '';
        for (const child of this._childNodes) {
          if (child.nodeType === COMMENT_NODE) continue;
          const tc = child.textContent;
          if (tc !== null) result += tc;
        }
        return result;
      }
      case TEXT_NODE:
      case COMMENT_NODE:
        // Subclasses override to return their data.
        return null;
      case DOCUMENT_NODE:
        return null;
      default:
        return null;
    }
  }

  set textContent(value: string | null) {
    switch (this.nodeType) {
      case ELEMENT_NODE:
      case DOCUMENT_FRAGMENT_NODE: {
        // Remove all children.
        while (this._childNodes.length > 0) {
          this.removeChild(this._childNodes[this._childNodes.length - 1]);
        }
        // If the new value is a non-empty string, create a text node.
        if (value !== null && value !== '') {
          const text = new SpaceText(value);
          text._ownerDocument = this._ownerDocument;
          this.appendChild(text);
        }
        break;
      }
      case TEXT_NODE:
      case COMMENT_NODE:
        // Subclass setter handles this via nodeValue.
        break;
      case DOCUMENT_NODE:
        // Per spec, setting textContent on Document does nothing.
        break;
    }
  }

  // -- Tree mutation --------------------------------------------------------

  appendChild(child: SpaceNode): SpaceNode {
    return this._insertChildBefore(child, null);
  }

  insertBefore(newChild: SpaceNode, refChild: SpaceNode | null): SpaceNode {
    return this._insertChildBefore(newChild, refChild);
  }

  removeChild(child: SpaceNode): SpaceNode {
    const idx = this._childNodes.indexOf(child);
    if (idx === -1) {
      throw new SpaceDOMException(
        'The node to be removed is not a child of this node',
        'NotFoundError',
      );
    }

    // Fix sibling links.
    const prev = child._previousSibling;
    const next = child._nextSibling;
    if (prev) prev._nextSibling = next;
    if (next) next._previousSibling = prev;

    // Remove from array.
    this._childNodes.splice(idx, 1);

    // Clear parent and sibling references on the removed child.
    child._parentNode = null;
    child._previousSibling = null;
    child._nextSibling = null;

    return child;
  }

  replaceChild(newChild: SpaceNode, oldChild: SpaceNode): SpaceNode {
    this.insertBefore(newChild, oldChild);
    this.removeChild(oldChild);
    return oldChild;
  }

  /**
   * Clone this node. Subclasses provide the actual implementation.
   * @param deep — if true, recursively clone children.
   */
  cloneNode(deep: boolean = false): SpaceNode {
    // Base implementation — subclasses override.
    void deep;
    throw new SpaceDOMException(
      'cloneNode not implemented for nodeType ' + this.nodeType,
      'NotSupportedError',
    );
  }

  /**
   * Returns true if `other` is a descendant of this node (or is this node).
   */
  contains(other: SpaceNode | null): boolean {
    let current: SpaceNode | null = other;
    while (current !== null) {
      if (current === this) return true;
      current = current._parentNode;
    }
    return false;
  }

  hasChildNodes(): boolean {
    return this._childNodes.length > 0;
  }

  /**
   * Deep structural/value equality comparison.
   */
  isEqualNode(other: SpaceNode | null): boolean {
    if (other === null) return false;
    if (this.nodeType !== other.nodeType) return false;
    if (this.nodeName !== other.nodeName) return false;
    if (this.nodeValue !== other.nodeValue) return false;

    // Compare attributes for elements.
    if (this.nodeType === ELEMENT_NODE && other.nodeType === ELEMENT_NODE) {
      const thisEl = this as unknown as SpaceElement;
      const otherEl = other as unknown as SpaceElement;
      if (thisEl._attrs.length !== otherEl._attrs.length) return false;
      for (const attr of thisEl._attrs) {
        const otherAttr = otherEl.getAttributeNS(attr.namespaceURI, attr.localName);
        if (otherAttr !== attr.value) return false;
      }
    }

    // Compare children.
    if (this._childNodes.length !== other._childNodes.length) return false;
    for (let i = 0; i < this._childNodes.length; i++) {
      if (!this._childNodes[i].isEqualNode(other._childNodes[i])) return false;
    }

    return true;
  }

  /**
   * Merge adjacent Text nodes and remove empty Text nodes among this
   * node's children.  Recurses into Element children.
   */
  normalize(): void {
    let i = 0;
    while (i < this._childNodes.length) {
      const child = this._childNodes[i];

      if (child.nodeType === TEXT_NODE) {
        const textNode = child as SpaceText;

        // Remove empty text nodes.
        if (textNode.data === '') {
          this.removeChild(textNode);
          continue; // Don't increment — array shifted.
        }

        // Merge with following adjacent text nodes.
        while (
          i + 1 < this._childNodes.length &&
          this._childNodes[i + 1].nodeType === TEXT_NODE
        ) {
          const next = this._childNodes[i + 1] as SpaceText;
          textNode.data += next.data;
          this.removeChild(next);
        }

        i++;
      } else {
        // Recurse into element children.
        if (child.nodeType === ELEMENT_NODE) {
          child.normalize();
        }
        i++;
      }
    }
  }

  // -- Internal insertion ---------------------------------------------------

  /**
   * Core insertion logic shared by appendChild and insertBefore.
   * Handles DocumentFragment expansion, reparenting, hierarchy checks,
   * sibling pointer maintenance, and ownerDocument propagation.
   */
  _insertChildBefore(newChild: SpaceNode, refChild: SpaceNode | null): SpaceNode {
    // 1. DocumentFragment: insert each child individually.
    if (newChild.nodeType === DOCUMENT_FRAGMENT_NODE) {
      // Snapshot children — they will be removed from the fragment as we go.
      const children = newChild._childNodes.slice();
      for (const child of children) {
        this._insertChildBefore(child, refChild);
      }
      return newChild;
    }

    // 2. Hierarchy check — newChild must not be an ancestor of `this`.
    if (newChild.contains(this)) {
      throw new SpaceDOMException(
        'The new child is an ancestor of this node',
        'HierarchyRequestError',
      );
    }

    // 3. If newChild already has a parent, remove it (reparenting).
    if (newChild._parentNode !== null) {
      newChild._parentNode.removeChild(newChild);
    }

    // 4. Determine insertion index.
    let idx: number;
    if (refChild === null) {
      idx = this._childNodes.length;
    } else {
      idx = this._childNodes.indexOf(refChild);
      if (idx === -1) {
        throw new SpaceDOMException(
          'The reference child is not a child of this node',
          'NotFoundError',
        );
      }
    }

    // 5. Splice into _childNodes.
    this._childNodes.splice(idx, 0, newChild);

    // 6. Set parent.
    newChild._parentNode = this;

    // 7. Fix sibling pointers.
    const prev = idx > 0 ? this._childNodes[idx - 1] : null;
    const next = idx < this._childNodes.length - 1 ? this._childNodes[idx + 1] : null;

    newChild._previousSibling = prev;
    newChild._nextSibling = next;
    if (prev) prev._nextSibling = newChild;
    if (next) next._previousSibling = newChild;

    // 8. Propagate ownerDocument.
    const doc =
      this.nodeType === DOCUMENT_NODE
        ? (this as unknown as SpaceDocument)
        : this._ownerDocument;
    SpaceNode._setOwnerDocumentRecursive(newChild, doc);

    return newChild;
  }

  /**
   * Recursively sets _ownerDocument on a subtree.
   */
  static _setOwnerDocumentRecursive(
    node: SpaceNode,
    doc: SpaceDocument | null,
  ): void {
    // Per spec, Document nodes have _ownerDocument = null.
    if (node.nodeType !== DOCUMENT_NODE) {
      node._ownerDocument = doc;
    }
    for (const child of node._childNodes) {
      SpaceNode._setOwnerDocumentRecursive(child, doc);
    }
  }
}

// ---------------------------------------------------------------------------
// SpaceCharacterData
// ---------------------------------------------------------------------------

/**
 * Shared base class for Text and Comment nodes.
 */
export class SpaceCharacterData extends SpaceNode {
  _data: string;

  constructor(nodeType: number, nodeName: string, data: string) {
    super(nodeType, nodeName);
    this._data = data;
  }

  // -- data / length --------------------------------------------------------

  get data(): string {
    return this._data;
  }

  set data(value: string) {
    this._data = value;
  }

  get length(): number {
    return this._data.length;
  }

  // -- nodeValue delegates to data ------------------------------------------

  override get nodeValue(): string {
    return this._data;
  }

  override set nodeValue(value: string | null) {
    this._data = value ?? '';
  }

  // -- textContent delegates to data ----------------------------------------

  override get textContent(): string {
    return this._data;
  }

  override set textContent(value: string | null) {
    this._data = value ?? '';
  }

  // -- CharacterData methods ------------------------------------------------

  substringData(offset: number, count: number): string {
    if (offset < 0 || offset > this._data.length) {
      throw new SpaceDOMException('Offset out of range', 'IndexSizeError');
    }
    return this._data.substring(offset, offset + count);
  }

  appendData(data: string): void {
    this._data += data;
  }

  insertData(offset: number, data: string): void {
    if (offset < 0 || offset > this._data.length) {
      throw new SpaceDOMException('Offset out of range', 'IndexSizeError');
    }
    this._data =
      this._data.substring(0, offset) + data + this._data.substring(offset);
  }

  deleteData(offset: number, count: number): void {
    if (offset < 0 || offset > this._data.length) {
      throw new SpaceDOMException('Offset out of range', 'IndexSizeError');
    }
    this._data =
      this._data.substring(0, offset) +
      this._data.substring(offset + count);
  }

  replaceData(offset: number, count: number, data: string): void {
    if (offset < 0 || offset > this._data.length) {
      throw new SpaceDOMException('Offset out of range', 'IndexSizeError');
    }
    this._data =
      this._data.substring(0, offset) +
      data +
      this._data.substring(offset + count);
  }
}

// ---------------------------------------------------------------------------
// SpaceText
// ---------------------------------------------------------------------------

/**
 * A DOM Text node.
 */
export class SpaceText extends SpaceCharacterData {
  constructor(data: string = '') {
    super(TEXT_NODE, '#text', data);
  }

  /**
   * Splits this text node at the given offset.  The original node retains
   * data before the offset; a new text node with the remainder is inserted
   * after this node in the parent (if any) and returned.
   */
  splitText(offset: number): SpaceText {
    if (offset < 0 || offset > this._data.length) {
      throw new SpaceDOMException('Offset out of range', 'IndexSizeError');
    }

    const newData = this._data.substring(offset);
    this._data = this._data.substring(0, offset);

    const newNode = new SpaceText(newData);
    newNode._ownerDocument = this._ownerDocument;

    // Insert after this node in the parent, if any.
    if (this._parentNode !== null) {
      this._parentNode.insertBefore(newNode, this._nextSibling);
    }

    return newNode;
  }

  override cloneNode(_deep: boolean = false): SpaceText {
    const clone = new SpaceText(this._data);
    clone._ownerDocument = this._ownerDocument;
    return clone;
  }
}

// ---------------------------------------------------------------------------
// SpaceComment
// ---------------------------------------------------------------------------

/**
 * A DOM Comment node.
 */
export class SpaceComment extends SpaceCharacterData {
  constructor(data: string = '') {
    super(COMMENT_NODE, '#comment', data);
  }

  override cloneNode(_deep: boolean = false): SpaceComment {
    const clone = new SpaceComment(this._data);
    clone._ownerDocument = this._ownerDocument;
    return clone;
  }
}

// ---------------------------------------------------------------------------
// SpaceElement
// ---------------------------------------------------------------------------

/**
 * A DOM Element node.
 */
export class SpaceElement extends SpaceNode {
  localName: string;
  namespaceURI: string | null;
  prefix: string | null;

  /** Backing array for attributes — shared live with _attributes map. */
  _attrs: SpaceAttr[] = [];

  /** Live NamedNodeMap view over _attrs. */
  _attributes: SpaceNamedNodeMap;

  constructor(
    localName: string,
    namespaceURI: string | null = null,
    prefix: string | null = null,
  ) {
    const qualifiedName = prefix ? `${prefix}:${localName}` : localName;
    super(ELEMENT_NODE, qualifiedName);
    this.localName = localName;
    this.namespaceURI = namespaceURI;
    this.prefix = prefix;
    this._attributes = new SpaceNamedNodeMap(this._attrs);
  }

  // -- Convenience getters --------------------------------------------------

  get tagName(): string {
    return this.nodeName;
  }

  get attributes(): SpaceNamedNodeMap {
    return this._attributes;
  }

  get id(): string {
    return this.getAttribute('id') ?? '';
  }

  set id(value: string) {
    this.setAttribute('id', value);
  }

  get className(): string {
    return this.getAttribute('class') ?? '';
  }

  set className(value: string) {
    this.setAttribute('class', value);
  }

  // -- Element children helpers --------------------------------------------

  /**
   * Returns an SpaceHTMLCollection snapshot of direct element children.
   */
  get children(): SpaceHTMLCollection {
    const elements: SpaceElement[] = [];
    for (const child of this._childNodes) {
      if (child.nodeType === ELEMENT_NODE) {
        elements.push(child as SpaceElement);
      }
    }
    return new SpaceHTMLCollection(elements);
  }

  get firstElementChild(): SpaceElement | null {
    for (const child of this._childNodes) {
      if (child.nodeType === ELEMENT_NODE) return child as SpaceElement;
    }
    return null;
  }

  get lastElementChild(): SpaceElement | null {
    for (let i = this._childNodes.length - 1; i >= 0; i--) {
      if (this._childNodes[i].nodeType === ELEMENT_NODE) {
        return this._childNodes[i] as SpaceElement;
      }
    }
    return null;
  }

  get childElementCount(): number {
    let count = 0;
    for (const child of this._childNodes) {
      if (child.nodeType === ELEMENT_NODE) count++;
    }
    return count;
  }

  // -- Attribute methods ----------------------------------------------------

  getAttribute(qualifiedName: string): string | null {
    for (const attr of this._attrs) {
      if (attr.name === qualifiedName) return attr.value;
    }
    return null;
  }

  getAttributeNS(namespaceURI: string | null, localName: string): string | null {
    for (const attr of this._attrs) {
      if (attr.namespaceURI === namespaceURI && attr.localName === localName) {
        return attr.value;
      }
    }
    return null;
  }

  setAttribute(qualifiedName: string, value: string): void {
    for (const attr of this._attrs) {
      if (attr.name === qualifiedName) {
        attr.value = value;
        return;
      }
    }
    const newAttr = new SpaceAttr(qualifiedName, value);
    newAttr._ownerElement = this;
    this._attrs.push(newAttr);
  }

  setAttributeNS(
    namespaceURI: string | null,
    qualifiedName: string,
    value: string,
  ): void {
    const colonIdx = qualifiedName.indexOf(':');
    const prefix = colonIdx >= 0 ? qualifiedName.substring(0, colonIdx) : null;
    const localName =
      colonIdx >= 0 ? qualifiedName.substring(colonIdx + 1) : qualifiedName;

    for (const attr of this._attrs) {
      if (attr.namespaceURI === namespaceURI && attr.localName === localName) {
        attr.value = value;
        attr.name = qualifiedName;
        attr.prefix = prefix;
        return;
      }
    }

    const newAttr = new SpaceAttr(qualifiedName, value, namespaceURI, prefix);
    newAttr._ownerElement = this;
    this._attrs.push(newAttr);
  }

  removeAttribute(qualifiedName: string): void {
    for (let i = 0; i < this._attrs.length; i++) {
      if (this._attrs[i].name === qualifiedName) {
        this._attrs[i]._ownerElement = null;
        this._attrs.splice(i, 1);
        return;
      }
    }
  }

  removeAttributeNS(namespaceURI: string | null, localName: string): void {
    for (let i = 0; i < this._attrs.length; i++) {
      if (
        this._attrs[i].namespaceURI === namespaceURI &&
        this._attrs[i].localName === localName
      ) {
        this._attrs[i]._ownerElement = null;
        this._attrs.splice(i, 1);
        return;
      }
    }
  }

  hasAttribute(qualifiedName: string): boolean {
    for (const attr of this._attrs) {
      if (attr.name === qualifiedName) return true;
    }
    return false;
  }

  hasAttributeNS(namespaceURI: string | null, localName: string): boolean {
    for (const attr of this._attrs) {
      if (attr.namespaceURI === namespaceURI && attr.localName === localName) {
        return true;
      }
    }
    return false;
  }

  /**
   * Toggles the attribute.  If force is provided, adds/removes accordingly.
   * Returns true if the attribute is now present, false otherwise.
   */
  toggleAttribute(qualifiedName: string, force?: boolean): boolean {
    const exists = this.hasAttribute(qualifiedName);
    if (force === undefined) {
      if (exists) {
        this.removeAttribute(qualifiedName);
        return false;
      } else {
        this.setAttribute(qualifiedName, '');
        return true;
      }
    }
    if (force) {
      if (!exists) this.setAttribute(qualifiedName, '');
      return true;
    } else {
      if (exists) this.removeAttribute(qualifiedName);
      return false;
    }
  }

  // -- Query methods --------------------------------------------------------

  /**
   * Returns all descendant elements matching the given tag name (case-
   * insensitive).  Use '*' to match any tag.  Does NOT include `this`.
   */
  getElementsByTagName(tagName: string): SpaceHTMLCollection {
    const results: SpaceElement[] = [];
    const matchAll = tagName === '*';

    const walk = (node: SpaceNode): void => {
      for (const child of node._childNodes) {
        if (child.nodeType === ELEMENT_NODE) {
          const el = child as SpaceElement;
          if (matchAll || el.nodeName === tagName) {
            results.push(el);
          }
          walk(el);
        }
      }
    };

    walk(this);
    return new SpaceHTMLCollection(results);
  }

  /**
   * Returns all descendant elements matching the given namespace and local
   * name.  Use '*' as a wildcard for either parameter.
   */
  getElementsByTagNameNS(
    namespaceURI: string | null,
    localName: string,
  ): SpaceHTMLCollection {
    const results: SpaceElement[] = [];
    const matchAllNS = namespaceURI === '*';
    const matchAllLocal = localName === '*';

    const walk = (node: SpaceNode): void => {
      for (const child of node._childNodes) {
        if (child.nodeType === ELEMENT_NODE) {
          const el = child as SpaceElement;
          const nsMatch = matchAllNS || el.namespaceURI === namespaceURI;
          const localMatch = matchAllLocal || el.localName === localName;
          if (nsMatch && localMatch) {
            results.push(el);
          }
          walk(el);
        }
      }
    };

    walk(this);
    return new SpaceHTMLCollection(results);
  }

  /**
   * Returns all descendant elements that have ALL of the space-separated
   * class names.
   */
  getElementsByClassName(classNames: string): SpaceHTMLCollection {
    const results: SpaceElement[] = [];
    const required = classNames
      .split(/\s+/)
      .filter((s) => s.length > 0);
    if (required.length === 0) return new SpaceHTMLCollection(results);

    const walk = (node: SpaceNode): void => {
      for (const child of node._childNodes) {
        if (child.nodeType === ELEMENT_NODE) {
          const el = child as SpaceElement;
          const elClasses = (el.getAttribute('class') ?? '')
            .split(/\s+/)
            .filter((s) => s.length > 0);
          let allMatch = true;
          for (const req of required) {
            if (elClasses.indexOf(req) === -1) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) results.push(el);
          walk(el);
        }
      }
    };

    walk(this);
    return new SpaceHTMLCollection(results);
  }

  // -- cloneNode ------------------------------------------------------------

  override cloneNode(deep: boolean = false): SpaceElement {
    const clone = new SpaceElement(
      this.localName,
      this.namespaceURI,
      this.prefix,
    );
    clone._ownerDocument = this._ownerDocument;

    // Clone attributes — independent copies.
    for (const attr of this._attrs) {
      const clonedAttr = new SpaceAttr(
        attr.name,
        attr.value,
        attr.namespaceURI,
        attr.prefix,
      );
      clonedAttr._ownerElement = clone;
      clone._attrs.push(clonedAttr);
    }

    // Deep clone children if requested.
    if (deep) {
      for (const child of this._childNodes) {
        clone.appendChild(child.cloneNode(true));
      }
    }

    return clone;
  }

  // -- innerHTML / outerHTML ------------------------------------------------

  get innerHTML(): string {
    return serializeChildren(this);
  }

  set innerHTML(html: string) {
    // Remove existing children.
    while (this._childNodes.length > 0) {
      this.removeChild(this._childNodes[this._childNodes.length - 1]);
    }

    if (html === '') return;

    if (_parseHTML !== null) {
      const doc = this._ownerDocument ?? new SpaceDocument();
      const nodes = _parseHTML(html, doc);
      for (const node of nodes) {
        this.appendChild(node);
      }
    } else {
      // Fallback: treat entire HTML as a text node.
      const text = new SpaceText(html);
      text._ownerDocument = this._ownerDocument;
      this.appendChild(text);
    }
  }

  get outerHTML(): string {
    return serializeNode(this);
  }

  // -- Selector stubs (Tier 3 — deferred) ----------------------------------

  querySelector(_selectors: string): SpaceElement | null {
    throw new SpaceDOMException(
      'Not implemented — load SpaceDOMSelectors',
      'NotSupportedError',
    );
  }

  querySelectorAll(_selectors: string): SpaceNodeList {
    throw new SpaceDOMException(
      'Not implemented — load SpaceDOMSelectors',
      'NotSupportedError',
    );
  }

  matches(_selectors: string): boolean {
    throw new SpaceDOMException(
      'Not implemented — load SpaceDOMSelectors',
      'NotSupportedError',
    );
  }

  closest(_selectors: string): SpaceElement | null {
    throw new SpaceDOMException(
      'Not implemented — load SpaceDOMSelectors',
      'NotSupportedError',
    );
  }
}

// ---------------------------------------------------------------------------
// SpaceDocumentFragment
// ---------------------------------------------------------------------------

/**
 * A lightweight document fragment node used as a staging container for
 * batch DOM mutations.
 */
export class SpaceDocumentFragment extends SpaceNode {
  constructor() {
    super(DOCUMENT_FRAGMENT_NODE, '#document-fragment');
  }

  // -- Element children helpers (same pattern as SpaceElement) ---------------

  get children(): SpaceHTMLCollection {
    const elements: SpaceElement[] = [];
    for (const child of this._childNodes) {
      if (child.nodeType === ELEMENT_NODE) {
        elements.push(child as SpaceElement);
      }
    }
    return new SpaceHTMLCollection(elements);
  }

  get firstElementChild(): SpaceElement | null {
    for (const child of this._childNodes) {
      if (child.nodeType === ELEMENT_NODE) return child as SpaceElement;
    }
    return null;
  }

  get lastElementChild(): SpaceElement | null {
    for (let i = this._childNodes.length - 1; i >= 0; i--) {
      if (this._childNodes[i].nodeType === ELEMENT_NODE) {
        return this._childNodes[i] as SpaceElement;
      }
    }
    return null;
  }

  get childElementCount(): number {
    let count = 0;
    for (const child of this._childNodes) {
      if (child.nodeType === ELEMENT_NODE) count++;
    }
    return count;
  }

  override cloneNode(deep: boolean = false): SpaceDocumentFragment {
    const clone = new SpaceDocumentFragment();
    clone._ownerDocument = this._ownerDocument;
    if (deep) {
      for (const child of this._childNodes) {
        clone.appendChild(child.cloneNode(true));
      }
    }
    return clone;
  }

  // -- Selector stubs -------------------------------------------------------

  querySelector(_selectors: string): SpaceElement | null {
    throw new SpaceDOMException(
      'Not implemented — load SpaceDOMSelectors',
      'NotSupportedError',
    );
  }

  querySelectorAll(_selectors: string): SpaceNodeList {
    throw new SpaceDOMException(
      'Not implemented — load SpaceDOMSelectors',
      'NotSupportedError',
    );
  }
}

// ---------------------------------------------------------------------------
// SpaceDocument
// ---------------------------------------------------------------------------

/**
 * The document node — serves as a factory for all other node types and
 * the root of the DOM tree.
 */
export class SpaceDocument extends SpaceNode {
  constructor() {
    super(DOCUMENT_NODE, '#document');
    // Per spec, a Document's ownerDocument is null.
    this._ownerDocument = null;
  }

  // -- documentElement ------------------------------------------------------

  /**
   * Returns the first element child (typically <html>).
   */
  get documentElement(): SpaceElement | null {
    for (const child of this._childNodes) {
      if (child.nodeType === ELEMENT_NODE) return child as SpaceElement;
    }
    return null;
  }

  // -- Factory methods ------------------------------------------------------

  createElement(tagName: string): SpaceElement {
    const el = new SpaceElement(tagName.toLowerCase());
    el._ownerDocument = this;
    return el;
  }

  createElementNS(
    namespaceURI: string | null,
    qualifiedName: string,
  ): SpaceElement {
    const colonIdx = qualifiedName.indexOf(':');
    const prefix = colonIdx >= 0 ? qualifiedName.substring(0, colonIdx) : null;
    const localName =
      colonIdx >= 0 ? qualifiedName.substring(colonIdx + 1) : qualifiedName;

    const el = new SpaceElement(localName, namespaceURI, prefix);
    el._ownerDocument = this;
    return el;
  }

  createTextNode(data: string): SpaceText {
    const text = new SpaceText(data);
    text._ownerDocument = this;
    return text;
  }

  createComment(data: string): SpaceComment {
    const comment = new SpaceComment(data);
    comment._ownerDocument = this;
    return comment;
  }

  createDocumentFragment(): SpaceDocumentFragment {
    const frag = new SpaceDocumentFragment();
    frag._ownerDocument = this;
    return frag;
  }

  createAttribute(localName: string): SpaceAttr {
    return new SpaceAttr(localName);
  }

  createAttributeNS(
    namespaceURI: string | null,
    qualifiedName: string,
  ): SpaceAttr {
    const colonIdx = qualifiedName.indexOf(':');
    const prefix = colonIdx >= 0 ? qualifiedName.substring(0, colonIdx) : null;
    return new SpaceAttr(qualifiedName, '', namespaceURI, prefix);
  }

  // -- Query methods --------------------------------------------------------

  /**
   * DFS search for the first element with a matching `id` attribute.
   */
  getElementById(id: string): SpaceElement | null {
    const walk = (node: SpaceNode): SpaceElement | null => {
      for (const child of node._childNodes) {
        if (child.nodeType === ELEMENT_NODE) {
          const el = child as SpaceElement;
          if (el.getAttribute('id') === id) return el;
          const found = walk(el);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(this);
  }

  getElementsByTagName(tagName: string): SpaceHTMLCollection {
    const results: SpaceElement[] = [];
    const matchAll = tagName === '*';

    const walk = (node: SpaceNode): void => {
      for (const child of node._childNodes) {
        if (child.nodeType === ELEMENT_NODE) {
          const el = child as SpaceElement;
          if (matchAll || el.nodeName === tagName) {
            results.push(el);
          }
          walk(el);
        }
      }
    };

    walk(this);
    return new SpaceHTMLCollection(results);
  }

  getElementsByClassName(classNames: string): SpaceHTMLCollection {
    const results: SpaceElement[] = [];
    const required = classNames
      .split(/\s+/)
      .filter((s) => s.length > 0);
    if (required.length === 0) return new SpaceHTMLCollection(results);

    const walk = (node: SpaceNode): void => {
      for (const child of node._childNodes) {
        if (child.nodeType === ELEMENT_NODE) {
          const el = child as SpaceElement;
          const elClasses = (el.getAttribute('class') ?? '')
            .split(/\s+/)
            .filter((s) => s.length > 0);
          let allMatch = true;
          for (const req of required) {
            if (elClasses.indexOf(req) === -1) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) results.push(el);
          walk(el);
        }
      }
    };

    walk(this);
    return new SpaceHTMLCollection(results);
  }

  // -- importNode -----------------------------------------------------------

  /**
   * Clones `node` (optionally deep) and recursively sets _ownerDocument to
   * this document on the entire subtree.
   */
  importNode(node: SpaceNode, deep: boolean = false): SpaceNode {
    const clone = node.cloneNode(deep);
    SpaceNode._setOwnerDocumentRecursive(clone, this);
    return clone;
  }

  // -- cloneNode ------------------------------------------------------------

  override cloneNode(deep: boolean = false): SpaceDocument {
    const clone = new SpaceDocument();
    if (deep) {
      for (const child of this._childNodes) {
        clone.appendChild(child.cloneNode(true));
      }
    }
    return clone;
  }
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for use inside an XML/HTML attribute value.
 */
export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape a string for use as XML/HTML text content.
 */
export function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Serialize a single node to an XML/HTML string.
 */
export function serializeNode(node: SpaceNode): string {
  switch (node.nodeType) {
    case ELEMENT_NODE: {
      const el = node as SpaceElement;
      let tag = el.localName;

      // Build opening tag with attributes.
      let open = '<' + tag;
      for (const attr of el._attrs) {
        open += ' ' + attr.name + '="' + escapeAttr(attr.value) + '"';
      }

      // Void elements (self-closing in HTML).
      const voidElements = new Set([
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
        'link', 'meta', 'param', 'source', 'track', 'wbr',
      ]);

      if (voidElements.has(tag) && el._childNodes.length === 0) {
        return open + ' />';
      }

      open += '>';
      const inner = serializeChildren(el);
      return open + inner + '</' + tag + '>';
    }

    case TEXT_NODE: {
      const text = node as SpaceText;
      return escapeText(text.data);
    }

    case COMMENT_NODE: {
      const comment = node as SpaceComment;
      return '<!--' + comment.data + '-->';
    }

    case DOCUMENT_NODE:
    case DOCUMENT_FRAGMENT_NODE:
      return serializeChildren(node);

    default:
      return '';
  }
}

/**
 * Serialize all child nodes of a given node.
 */
export function serializeChildren(node: SpaceNode): string {
  let result = '';
  for (const child of node._childNodes) {
    result += serializeNode(child);
  }
  return result;
}
