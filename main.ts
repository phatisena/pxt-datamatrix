
//%block="Data matrix"
//%color="#2c48b8"
//%icon="\uf02a"
namespace DataMatrix {

    function addnumarr(cou:number) {
        let uarr: number[] = []
        for (let i = 0;i < cou;i++) {
            uarr.push(0)
        }
        return uarr
    }

    function datamgen(text:string, rect:boolean): number[][] {
        let enc:number[] = [], cw = 0, ce = 0; // byte stream
        function push(val:number) { // encode bit stream c40/text/x12
            cw = 40 * cw + val;
            if (ce++ == 2) { // full, add code
                enc.push(++cw >> 8); // 3 chars in 2 bytes
                enc.push(cw & 255);
                ce = cw = 0;
            }
        }
        let cost: any[] = [ // compute char cost in 1/12 bytes for mode..
            function (c:number) { return ((c - 48) & 255) < 10 ? 6 : c < 128 ? 12 : 24; }, // ascii
            function (c:number) { return ((c - 48) & 255) < 10 || ((c - 65) & 255) < 26 || c == 32 ? 8 : c < 128 ? 16 : 16 + cost[1](c & 127); }, // c40
            function (c:number) { return ((c - 48) & 255) < 10 || ((c - 97) & 255) < 26 || c == 32 ? 8 : c < 128 ? 16 : 16 + cost[2](c & 127); }, // text
            function (c:number) { return ((c - 48) & 255) < 10 || ((c - 65) & 255) < 26 || c == 32 || c == 13 || c == 62 || c == 42 ? 8 : 1e9; }, //x12
            function (c:number) { return c >= 32 && c < 95 ? 9 : 1e9; }, // edifact
            function (c:number) { return 12; } // base256
        ];
        let latch = [0, 24, 24, 24, 21, 25]; // latch+unlatch costs
        let count = [0, 12, 12, 12, 12, 25]; // actual costs (start by latch only)
        let c, i, p, cm = 0, nm = 0; // current / next mode
        let bytes = []; // cost table in 1/12 bytes

        bytes[text.length] = count.slice(); // compute byte costs..
        for (p = text.length; p-- > 0;) { // ..by dynamic programming
            for (c = 1e9, i = 0; i < count.length; i++) {
                count[i] += cost[i](text.charCodeAt(p)); // accumulate costs from back
                c = Math.min(c, Math.ceil(count[i] / 12) * 12); // get minimum in full bytes
            }					// ascii mode: if non digit round up to full byte
            if (cost[0](text.charCodeAt(p)) > 6) count[0] = Math.ceil(count[0] / 12) * 12;
            for (i = 0; i < count.length; i++) // latch to shorter mode?
                if (c + latch[i] < count[i]) count[i] = c + latch[i];
            bytes[p] = count.slice(); // record costs
        }
        for (p = 0; ; cm = nm) { // encode text
            c = bytes[p][cm] - latch[cm];
            if (p + [0, 2, 2, 2, 3, 0][cm] >= text.length) nm = 0; // finished, return to ascii
            else for (i = cost.length; i-- > 0;) // check if a mode is shorter
                if (Math.ceil((bytes[p + 1][i] + cost[i](text.charCodeAt(p))) / 12) * 12 == c)
                    nm = i; // change to shorter mode

            if (cm != nm && cm > 0) // return to ascii mode
                if (cm < 4) enc.push(254); // unlatch c40/text/x12
                else if (cm == 4) enc.push(31 | cw & 255); // unlatch edifact, add last byte
                else {			// encode base256 in 255 state rand algo
                    if (ce > 249) enc.push((ce / 250 + 250 + (149 * (enc.length + 1)) % 255) & 255); // high
                    enc.push((ce % 250 + (149 * (enc.length + 1)) % 255 + 1) & 255); // encode low length
                    for (; ce > 0; ce--) // encode base256 data 
                        enc.push((text.charCodeAt(p - ce) + (149 * (enc.length + 1)) % 255 + 1) & 255);
                }
            if (p >= text.length) break; // encoding finished
            if (cm != nm) cw = ce = 0; // reset packing
            if (cm != nm && nm > 0) // latch to c40/text/x12/edifact/base256
                enc.push([230, 239, 238, 240, 231][nm - 1]);

            if (nm == 0) { // encode ascii
                c = text.charCodeAt(p++); i = (c - 48) & 255;
                if (i < 10 && p < text.length && ((text.charCodeAt(p) - 48) & 255) < 10)
                    enc.push(i * 10 + text.charCodeAt(p++) - 48 + 130); // two digits
                else {
                    if (c > 127) enc.push(235); // upper shift
                    enc.push((c & 127) + 1); // encode data
                }
                if (cm == 4 || ce < 0) ce--; // count post edifact chars
            } else if (nm < 4) { // encode c40, text, x12	        	
                let set = [[31, 0, 32, 119, 47, 133, 57, 179, 64, 173, 90, 207, 95, 277, 127, 386, 255, 1], // c40
                [31, 0, 32, 119, 47, 133, 57, 179, 64, 173, 90, 258, 95, 277, 122, 335, 127, 386, 255, 1], // text
                [13, 55, 32, 119, 42, 167, 57, 179, 62, 243, 90, 207, 255, 3]][nm - 1]; // x12
                do { // set contains character range dupels: upper value, shift*4+set-1
                    c = text.charCodeAt(p++);
                    if (c > 127) { push(1); push(30); c &= 127; } // upper shift
                    for (i = 0; c > set[i]; i += 2); // select char set
                    if ((set[i + 1] & 3) < 3) push(set[i + 1] & 3); // select set
                    push(c - (set[i + 1] >> 2));
                } while (ce > 0);
            } else if (nm == 4) { // encode edifact
                if (ce > 0) enc.push(255 & cw + (text.charCodeAt(p++) & 63)); // 3rd byte
                for (cw = ce = 0; ce < 3; ce++)
                    cw = 64 * (cw + (text.charCodeAt(p++) & 63));
                enc.push(cw >> 16); // 4 chars in 3 bytes
                enc.push((cw >> 8) & 255);
            } else { p++; ce++; } // count base256 chars
        }
        let el = enc.length; // compute symbol size
        let h, w, nc = 1, nr = 1, fw, fh; // symbol size, regions, region size
        let j = -1, l, r, s, b = 1, k;

        if (ce == -1 || (cm && cm < 5)) nm = 1; // c40/text/x12/edifact unlatch removable
        if (rect && el - nm < 50) { // rectangular symbol possible
            k = [16, 7, 28, 11, 24, 14, 32, 18, 32, 24, 44, 28]; // symbol width, checkwords
            do {
                w = k[++j]; // width w/o finder pattern
                h = 6 + (j & 12); // height
                l = w * h / 8; // # of bytes in symbol
            } while (l - k[++j] < el - nm); // data + check fit in symbol?
            if (w > 25) nc = 2; // column regions
        } else { // square symbol
            w = h = 6;
            i = 2; // size increment
            k = [5, 7, 10, 12, 14, 18, 20, 24, 28, 36, 42, 48, 56, 68, 84,
                112, 144, 192, 224, 272, 336, 408, 496, 620]; // RS checkwords
            do {
                if (++j == k.length) return []; // message too long for Datamatrix
                if (w > 11 * i) i = 4 + i & 12; // advance increment
                w = h += i;
                l = (w * h) >> 3;
            } while (l - k[j] < el - nm); // data + check fit in symbol?
            if (w > 27) nr = nc = 2 * Math.floor(w / 54) + 2; // regions
            if (l > 255) b = 2 * (l >> 9) + 2; // blocks
        }
        s = k[j]; // RS checkwords
        if (l - s + 1 == el && nm > 0) { // remove last unlatch to fit in smaller symbol
            el--; 				// replace edifact unlatch by char
            if (ce == -1) enc[el - 1] ^= 31 ^ (enc[el] - 1) & 63;
        }
        fw = w / nc; fh = h / nr; // region size
        if (el < l - s) enc[el++] = 129; // first padding
        while (el < l - s) // add more padding
            enc[el++] = (((149 * el) % 253) + 130) % 254;

        s /= b; // compute Reed Solomon error detection and correction
        let rs = addnumarr(70), rc = addnumarr(70); // reed/solomon code
        let lg = addnumarr(256), ex = addnumarr(255); // log/exp table for multiplication
        for (j = 1, i = 0; i < 255; i++) { // compute log/exp table of Galois field
            ex[i] = j; lg[j] = i;
            j += j; if (j > 255) j ^= 301; // GF polynomial a^8+a^5+a^3+a^2+1 = 100101101b = 301
        }
        for (rs[s] = 0, i = 1; i <= s; i++)  // compute RS generator polynomial
            for (j = s - i, rs[j] = 1; j < s; j++)
                rs[j] = rs[j + 1] ^ ex[(lg[rs[j]] + i) % 255];
        for (c = 0; c < b; c++) { // compute RS correction data for each block
            for (i = 0; i <= s; i++) rc[i] = 0;
            for (i = c; i < el; i += b)
                for (j = 0, k = rc[0] ^ enc[i]; j < s; j++)
                    rc[j] = rc[j + 1] ^ (k ? ex[(lg[rs[j]] + lg[k]) % 255] : 0);
            for (i = 0; i < s; i++) // add interleaved correction data
                enc[el + c + i * b] = rc[i];
        }
        // layout perimeter finder pattern
        let mat = addnumarr(h + 2 * nr).fill(0).map(function () { return []; });
        for (i = 0; i < w + 2 * nc; i += fw + 2) // vertical
            for (j = 0; j < h; j++) {
                mat[j + (j / fh | 0) * 2 + 1][i] = 1;
                if ((j & 1) == 1) mat[j + (j / fh | 0) * 2][i + fw + 1] = 1;
            }
        for (i = 0; i < h + 2 * nr; i += fh + 2) // horizontal
            for (j = 0; j < w + 2 * nc; j++) {
                mat[i + fh + 1][j] = 1;
                if ((j & 1) == 0) mat[i][j] = 1;
            }
        // layout data
        s = 2; c = 0; r = 4; // step,column,row of data position
        for (i = 0; i < l; r -= s, c += s) { // diagonal steps
            if (r == h - 3 && c == -1) // corner A layout
                k = [w, 6 - h, w, 5 - h, w, 4 - h, w, 3 - h, w - 1, 3 - h, 3, 2, 2, 2, 1, 2];
            else if (r == h + 1 && c == 1 && (w & 7) == 0 && (h & 7) == 6) // corner D layout
                k = [w - 2, -h, w - 3, -h, w - 4, -h, w - 2, -1 - h, w - 3, -1 - h, w - 4, -1 - h, w - 2, -2, -1, -2];
            else {
                if (r == 0 && c == w - 2 && (w & 3)) continue; // corner B: omit upper left
                if (r < 0 || c >= w || r >= h || c < 0) {  // outside
                    s = -s; r += 2 + s / 2; c += 2 - s / 2;        // turn around
                    while (r < 0 || c >= w || r >= h || c < 0) { r -= s; c += s; }
                }
                if (r == h - 2 && c == 0 && (w & 3)) // corner B layout
                    k = [w - 1, 3 - h, w - 1, 2 - h, w - 2, 2 - h, w - 3, 2 - h, w - 4, 2 - h, 0, 1, 0, 0, 0, -1];
                else if (r == h - 2 && c == 0 && (w & 7) == 4) // corner C layout
                    k = [w - 1, 5 - h, w - 1, 4 - h, w - 1, 3 - h, w - 1, 2 - h, w - 2, 2 - h, 0, 1, 0, 0, 0, -1];
                else if (r == 1 && c == w - 1 && (w & 7) == 0 && (h & 7) == 6) continue; // omit corner D
                else k = [0, 0, -1, 0, -2, 0, 0, -1, -1, -1, -2, -1, -1, -2, -2, -2]; // nominal L-shape layout
            }
            for (el = enc[i++], j = 0; el > 0; j += 2, el >>= 1) { // layout each bit
                if (el & 1) {
                    let x = c + k[j], y = r + k[j + 1];
                    if (x < 0) { x += w; y += 4 - ((w + 4) & 7); } // wrap around
                    if (y < 0) { y += h; x += 4 - ((h + 4) & 7); }
                    mat[y + 2 * (y / fh | 0) + 1][x + 2 * (x / fw | 0) + 1] = 1; // add region gap
                }
            }
        }
        for (i = w; i & 3; i--) mat[i][i] = 1; // unfilled corner
        return mat; // width and height of symbol
    }

    function stampImage(src: Image, to: Image, x: number, y: number) {
        if (!src || !to) { return; }
        to.drawTransparentImage(src, x, y)
    }

    let inprogress = false

    /**
     * create data matrix image with text input and gap number for quite zone level
     * @param the string input to encode to datamatrix image
     * @param get encode to datamatrix in ractangle/square on toggle
     * @param gap number for quite zone in data matrix image
     * @return to result by data matrix as image
     */
    //%blockid=datamatrix_image_createdatamatrix
    //%block="create DataMatrix image by $data in $ract|| gap $gap"
    //%ract.shadow="toggleRactangleSquare"
    //%data.defl="MAKECODE-ARCADE"
    //%gap.defl=4
    //%group="image"
    //%weight=10
    export function genimg(data: string = "", ract: boolean,gap: number = 4) {
        if (inprogress) {return image.create(1,1)}
        inprogress = true
        let outputnll: number[][] = datamgen(data,ract)
        let outputimg: Image = image.create(outputnll[0].length+1,outputnll.length)
        let bin = 0
        outputimg.fill(1)
        for (let y = 0;y < outputnll.length;y++) {
            for (let x = 0;x < outputnll[y].length+1;x++) {
                bin = outputnll[y][x]
                if (bin > 0) outputimg.setPixel(x,y,15);
            }
        }
        for (let y = 0;y < outputimg.height;y++) {
            if (y % 2 > 0) outputimg.setPixel(outputimg.width-1,y,15);
        }
        for (let x = 0;x < outputimg.width;x++) {
            if (x % 2 == 0) outputimg.setPixel(x,0,15);
        }
        let outputgap: Image = image.create(outputimg.width+(gap*2),outputimg.height+(gap*2))
        outputgap.fill(1)
        stampImage(outputimg,outputgap,gap,gap)
        inprogress = false
        return outputgap
    }
}
