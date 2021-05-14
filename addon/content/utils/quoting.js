/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* Below are hacks heuristics for finding quoted parts in a given email */

class _Quoting {
  _canInclude(aNode) {
    let v =
      aNode.tagName?.toLowerCase() == "br" ||
      (aNode.nodeType == aNode.TEXT_NODE && aNode.textContent.trim() === "");
    // if (v) dump("Including "+aNode+"\n");
    return v;
  }

  _isBody(aNode) {
    if (aNode.tagName?.toLowerCase() == "body") {
      return true;
    }
    let count = 0;
    for (let node of aNode.parentNode.childNodes) {
      // dump(node+" "+node.nodeType+"\n");
      switch (node.nodeType) {
        case node.TEXT_NODE:
          if (node.textContent.trim().length) {
            count++;
          }
          break;
        case node.ELEMENT_NODE:
          count++;
          break;
      }
    }
    // dump(count+"\n");
    return count == 1 && this._isBody(aNode.parentNode);
  }

  _implies(a, b) {
    return !a || (a && b);
  }

  /* Create a blockquote that encloses everything relevant, starting from marker.
   * Marker is included by default, remove it later if you need to. */
  _encloseInBlockquote(aDoc, marker) {
    if (marker.previousSibling && this._canInclude(marker.previousSibling)) {
      this._encloseInBlockquote(aDoc, marker.previousSibling);
    } else if (!marker.previousSibling && !this._isBody(marker.parentNode)) {
      this._encloseInBlockquote(aDoc, marker.parentNode);
    } else if (
      this._implies(
        marker == marker.parentNode.firstChild,
        !this._isBody(marker.parentNode)
      )
    ) {
      let blockquote = aDoc.createElement("blockquote");
      blockquote.setAttribute("type", "cite");
      marker.parentNode.insertBefore(blockquote, marker);
      while (blockquote.nextSibling) {
        blockquote.appendChild(blockquote.nextSibling);
      }
    }
  }

  _trySel(aDoc, sel, remove) {
    let marker = aDoc.querySelector(sel);
    if (marker) {
      this._encloseInBlockquote(aDoc, marker);
      if (remove) {
        marker.remove();
      }
    }
    return marker != null;
  }

  /* Hotmails use a <hr> to mark the start of the quoted part. */
  convertHotmailQuotingToBlockquote1(aDoc) {
    /* We make the assumption that no one uses a <hr> in their emails except for
     * separating a quoted message from the rest */
    this._trySel(
      aDoc,
      "body > hr, \
       body > div > hr, \
       body > pre > hr, \
       body > div > div > hr, \
       hr#stopSpelling",
      true
    );
  }

  convertMiscQuotingToBlockquote(aDoc) {
    this._trySel(aDoc, ".yahoo_quoted");
  }

  /* Stupid regexp that matches:
   * ----- Something that supposedly says the text below is quoted -----
   * Fails 9 times out of 10. */
  convertForwardedToBlockquote(aDoc) {
    const re =
      /^\s*(-{5,15})(?:\s*)(?:[^ \f\n\r\t\v\u00A0\u2028\u2029-]+\s+)*[^ \f\n\r\t\v\u00A0\u2028\u2029-]+(\s*)\1\s*/gm;
    const walk = (aNode) => {
      for (const child of aNode.childNodes) {
        const txt = child.textContent;
        const m = txt.match(re);
        if (
          child.nodeType == child.TEXT_NODE &&
          !txt.includes("-----BEGIN PGP") &&
          !txt.includes("----END PGP") &&
          m &&
          m.length
        ) {
          const marker = m[0];
          // dump("Found matching text "+marker+"\n");
          const i = txt.indexOf(marker);
          const t1 = txt.substring(0, i);
          const t2 = txt.substring(i + 1, child.textContent.length);
          const tn1 = aDoc.createTextNode(t1);
          const tn2 = aDoc.createTextNode(t2);
          child.parentNode.insertBefore(tn1, child);
          child.parentNode.insertBefore(tn2, child);
          child.remove();
          this._encloseInBlockquote(aDoc, tn2);
          let ex = new Error();
          ex.found = true;
          throw ex;
        } else if (m?.length) {
          // We only move on if we found the matching text in the parent's text
          // content, otherwise, there's no chance we'll find it in the child's
          // content.
          walk(child);
        }
      }
    };
    try {
      walk(aDoc.body);
    } catch (ex) {
      if (!ex.found) {
        throw ex;
      }
    }
  }

  /* If [b1] is a blockquote followed by [ns] whitespace nodes followed by [b2],
   * append [ns] to [b1], then append all the child nodes of [b2] to [b1],
   * effectively merging the two blockquotes together. */
  fusionBlockquotes(aDoc) {
    let blockquotes = new Set(aDoc.getElementsByTagName("blockquote"));
    for (let blockquote of blockquotes) {
      let isWhitespace = function (n) {
        return (
          n &&
          (n.tagName?.toLowerCase() == "br" ||
            (n.nodeType == n.TEXT_NODE && n.textContent.match(/^\s*$/)))
        );
      };
      let isBlockquote = function (b) {
        return b?.tagName?.toLowerCase() == "blockquote";
      };
      let blockquoteFollows = function (n) {
        return (
          n &&
          (isBlockquote(n) ||
            (isWhitespace(n) && blockquoteFollows(n.nextSibling)))
        );
      };
      while (blockquoteFollows(blockquote.nextSibling)) {
        while (isWhitespace(blockquote.nextSibling)) {
          blockquote.appendChild(blockquote.nextSibling);
        }
        if (isBlockquote(blockquote.nextSibling)) {
          let next = blockquote.nextSibling;
          while (next.firstChild) {
            blockquote.appendChild(next.firstChild);
          }
          blockquote.parentNode.removeChild(next);
          blockquotes.delete(next);
        } else {
          console.warn("What?!");
        }
      }
    }
  }

  /**
   * Use heuristics to find common types of email quotes and
   * wrap them in `<blockquote></blockquote>` tags.
   *
   * @param {HTMLDocument | string} doc
   * @returns {HTMLDocument | string}
   * @memberof _Quoting
   */
  normalizeBlockquotes(doc) {
    // We want to return the same type of object that was passed to us. We allow
    // both a string and an HTMLDom object.
    const origType = typeof doc;
    if (origType === "string") {
      const parser = new DOMParser();
      doc = parser.parseFromString(doc, "text/html");
    }

    try {
      // These operations mutate the Dom
      this.convertHotmailQuotingToBlockquote1(doc);
      this.convertForwardedToBlockquote(doc);
      this.convertMiscQuotingToBlockquote(doc);
      this.fusionBlockquotes(doc);
    } catch (e) {
      console.log(e);
    }

    if (origType === "string") {
      return doc.outerHTML;
    }
    return doc;
  }
}

export var Quoting = new _Quoting();
