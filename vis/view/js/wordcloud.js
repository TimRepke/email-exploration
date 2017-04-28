/**
 * Created by tim on 27/04/17.
 */

class WordCloud {
    constructor(baseurl, containerID, {filters=['ORG','PERSON', 'DATE','CARDINAL','MONEY'], active_filters=['ORG','PERSON']}={}) {
        this.wcc = document.getElementById(containerID);
        this.baseurl = baseurl;
        this.fill = d3.scale.category20();
        this.nav = {transX: 0, transY: 0, scale:1};
        this.active_filters = active_filters;
        this.last_hovered = null;
        this.hover_rect = null;
        this.click_rect = null;
        this.layout = null;
        this.wcc_svg = null;
        this.words = null;

        this.initLayout();
        this.initFilters(filters);
        this.drawReq();
    }
    initLayout() {
        let that = this;
        this.layout = d3.layout.cloud()
            .size([this.wcc.clientWidth, this.wcc.clientHeight])
            .padding(1)
            .rotate(0)
            .fontSize(function (d) {
                //return Math.sqrt(d.size + 8);
                return d.size * 3;
                //return Math.log(d.size);
            })
            .on('end', function(tags, bounds){
                console.log(bounds)
                that.populateSVG(tags);
            });
    }
    initSVG() {
        d3.select('#wcc').insert("svg", ":first-child")
            .attr("width", this.layout.size()[0])
            .attr("height", this.layout.size()[1])
            .append("g")
            .attr("transform", "translate(" + this.layout.size()[0] / 2 + "," + this.layout.size()[1] / 2 + ")");
        this.wcc_svg = document.querySelector('#wcc > svg');
        this.wcc_svg.style.setProperty('cursor', 'pointer');
    }
    populateSVG(words) {
        if (!this.wcc_svg) this.initSVG();
        WordCloud.clearSVG();
        let that = this;
        d3.select(document.querySelector('#wcc > svg > g'))
            .selectAll("text")
            .data(words)
            .enter().append("text")
            .style("font-size", function(d) { return d.size + "px"; })
            .style("font-family", "Impact")
            .style("fill", function(d, i) { return that.fill(i); })
            .attr("text-anchor", "middle")
            .attr("transform", function(d) {
                return "translate(" + [d.x, d.y] + ")rotate(" + d.rotate + ")";
            })
            .text(function(d) { return d.text; });
        this.hover_rect = this.spawn_rect({dashed: true});
        this.click_rect = this.spawn_rect();
        this.initEventListeners();
    }
    initFilters(filters) {
        let that = this;
        let fc = document.getElementById('wordcloud_filters');
        filters.forEach(function(filter) {
            let e = document.createElement('span');
            if (that.active_filters.indexOf(filter) >= 0)
                e.setAttribute('class', 'active');
            e.innerHTML = filter;
            fc.appendChild(e);
            e.addEventListener('click', function(e) {
                if (that.active_filters.indexOf(filter) < 0)
                    that.active_filters.push(filter);
                else that.active_filters.splice(that.active_filters.indexOf(filter), 1);
                console.log(filter);
                console.log(that.active_filters);
                that.drawReq()
            })
        })
    }
    initEventListeners() {
        let that = this;
        
        // two buttons in the top left
        document.getElementById("wordcloud_clear").addEventListener('click', function() {that.resetSelections();});
        document.getElementById("wordcloud_center").addEventListener('click', function() {that.resetZoomCenter();});

        // scroll to zoom
        this.wcc_svg.addEventListener('mousewheel', function (e) {
            let up = e.deltaY < 0;
            that.nav.scale = Math.max(1, (that.nav.scale + (up ? +1 : -1) * Math.log(that.nav.scale+0.1)));
            that.wcc_svg.style.transform = 'translate('+that.nav.transX+'px, '+that.nav.transY+'px) scale('+that.nav.scale+')';
            that.hover_rect.updateStoke();
            that.click_rect.updateStoke();
        });

        // drag to move
        that.wcc_svg.addEventListener('mousedown', function(e) {
            let startX = e.clientX, startY = e.clientY;
            let transX_old = that.nav.transX, transY_old = that.nav.transY;
            e.preventDefault();
            let onmove = function(e) {
                that.nav.transX = transX_old - (startX - e.clientX);
                that.nav.transY = transY_old - (startY - e.clientY);
                that.wcc_svg.style.transform = 'translate('+that.nav.transX+'px, '+that.nav.transY+'px) scale('+that.nav.scale+')';
            };
            let onup = function(e) {
                // let go, remove listeners
                document.removeEventListener('mousemove', onmove);
                document.removeEventListener('mouseup', onup);
            };

            // start
            document.addEventListener('mousemove', onmove);
            document.addEventListener('mouseup', onup);
        });
        
        // hover box
        this.wcc_svg.addEventListener('mousemove', function (e) {
            if (that.hover_rect.isHidden()) {
                that.hover_rect.show();
            }
            if (e.target && e.target.tagName === 'text' && e.target !== that.last_hovered){
                e.target.style.fill = WordCloud.monochromatic(e.target.style.fill, 0.2);
                if(that.last_hovered) that.last_hovered.style.fill = WordCloud.monochromatic(that.last_hovered.style.fill, 0.2);
                that.last_hovered = e.target;

                that.hover_rect.pos(WordCloud.getEventPos(e))
            }
        });
        this.wcc_svg.addEventListener('mouseleave', function (e) {
            that.last_hovered = undefined;
            // hover_rect.hide()
        });
        
        // select
        this.wcc_svg.addEventListener('click', function(e) {
            that.click_rect.show();
            that.click_rect.pos(WordCloud.getEventPos(e));
        });
    }
    static clearSVG() {
        // this.wcc_svg.parentElement.removeChild(this.wcc_svg);
        // this.wcc_svg = null;
        let tmp = document.querySelector('#wcc > svg > g');
        while (!!tmp && tmp.firstChild) {
            tmp.removeChild(tmp.firstChild);
        }
    }
    resetZoomCenter() {
        this.nav.transX = 0;
        this.nav.transY = 0;
        this.nav.scale = 1;
        this.wcc_svg.style.transform = 'translate('+this.nav.transX+'px, '+this.nav.transY+'px) scale('+this.nav.scale+')';
    }
    resetSelections(){
        this.click_rect.hide();
        this.hover_rect.hide();
    }
    spawn_rect({dashed=false} = {}) {
        let that = this;
        let rect = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
        let hidden = false;
        rect.setAttributeNS(null, 'fill', 'none');
        if (dashed) {
            rect.setAttributeNS(null, 'stroke-dasharray', '5,5');
        }
        rect.setAttributeNS(null, 'stroke', 'black');
        rect.setAttributeNS(null, 'stroke-width', '2');
        document.querySelector('#wcc > svg > g').appendChild(rect);

        return {
            show: function() {
                rect.style.setProperty('display', '');
                hidden = false;
            },
            isHidden: function() {
                return hidden;
            },
            hide: function() {
                rect.style.setProperty('display', 'none');
                hidden = true;
            },
            pos: function({x, y, height, width, transform, trans}) {
                //let trans = transform.match(/translate\((-?\d+),(-?\d+)\)|rotate\((-?\d+)\)/);
                //trans = {x: trans[1] || 0, y: trans[2] || 0, rotate: trans[3] || 0};
                rect.setAttributeNS(null, 'x', x);
                rect.setAttributeNS(null, 'y', y);
                rect.setAttributeNS(null, 'height', height);
                rect.setAttributeNS(null, 'width', width);
                rect.setAttributeNS(null, 'transform', 'translate('+trans.x+','+trans.y+')rotate('+trans.rotate+')');
            },
            updateStoke: function() {
                rect.setAttributeNS(null, 'stroke-width', ''+(2/that.nav.scale));
            }
        }
    }
    static monochromatic(RGBcolour, percentage) {
        RGBcolour = RGBcolour.split(',');
        let orig = $ui.color.rgb2hex([parseInt(RGBcolour[0].substring(4)), parseInt(RGBcolour[1]), parseInt(RGBcolour[2].slice(0, -1))]);
        return 'rgb('+$ui.color.hex2rgb($ui.color.percentage(percentage, orig, $ui.color.complement(orig))).join(',')+')';
    }
    static getEventPos(e) {
        let bounds = e.target.getBBox();
        let trans = e.target.getAttribute('transform').match(/translate\((-?\d+),(-?\d+)\).*rotate\((-?\d+)\)/);
        trans = {x: trans[1] || 0, y: trans[2] || 0, rotate: trans[3] || 0};

        return {
            x: bounds.x,
            y: bounds.y,
            height: bounds.height,
            width: bounds.width,
            transform: e.target.getAttribute('transform'),
            trans: trans
        }
    }
    set words(words) {
        //this.words = words;
        //this.layout.words(words);
    }
    res2words(res) {
        return res.map(function (e) {
            return {text: e['name'], size: e['cnt']};
        });
    }
    req({min=2, types=['ORG','PERSON']}={}) {
        console.log(this.active_filters)
        types = this.active_filters;
        return jsonReq(this.baseurl+'?min_cnt='+min+'&types='+types.join(','))
    }
    drawReq({min=2}={}) {
        let that = this;
        this.req({min: min, types: this.active_filters}).then(function(res){
            that.layout
                .words(that.res2words(res))
                .start();
        });
    }
}
