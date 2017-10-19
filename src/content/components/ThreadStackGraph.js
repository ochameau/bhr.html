import React, { Component, PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';
import actions from '../actions';
import shallowCompare from 'react-addons-shallow-compare';
import classNames from 'classnames';
import { timeCode } from '../../common/time-code';
import { getDateGraph } from '../reducers/date-graph';
import { getUsageHoursByDate } from '../reducers/profile-view';
import Tooltip from './Tooltip'

const BAR_WIDTH_RATIO = 0.8;
const TOOLTIP_MARGIN = 3;
const TOOLTIP_PADDING = 5;
const TOOLTIP_HEIGHT = 20;

class ThreadStackGraph extends Component {

  constructor(props) {
    super(props);
    this._resizeListener = () => this.forceUpdate();
    this._requestedAnimationFrame = false;
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseOut = this._onMouseOut.bind(this);
    this.state = {};
  }

  _scheduleDraw() {
    if (!this._requestedAnimationFrame) {
      this._requestedAnimationFrame = true;
      window.requestAnimationFrame(() => {
        this._requestedAnimationFrame = false;
        if (this.refs.canvas) {
          timeCode('ThreadStackGraph render', () => {
            this.drawCanvas(this.refs.canvas);
          });
        }
      });
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  componentDidMount() {
    const win = this.refs.canvas.ownerDocument.defaultView;
    win.addEventListener('resize', this._resizeListener);
    this.forceUpdate(); // for initial size
  }

  componentWillUnmount() {
    const win = this.refs.canvas.ownerDocument.defaultView;
    win.removeEventListener('resize', this._resizeListener);
  }

  drawCanvas(c) {
    let { rangeStart, rangeEnd, dateGraph } = this.props;

    const devicePixelRatio = c.ownerDocument ? c.ownerDocument.defaultView.devicePixelRatio : 1;
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * devicePixelRatio);
    c.height = Math.round(r.height * devicePixelRatio);
    const ctx = c.getContext('2d');
    const rangeLength = rangeEnd - rangeStart + 1;

    const { maxHangMs, maxHangCount } = this._getMaxGraphValues();

    const xDevicePixelsPerDay = c.width / rangeLength;
    const yDevicePixelsPerHangMs = c.height / maxHangMs;
    const yDevicePixelsPerHangCount = c.height / maxHangCount;

    for (let i = rangeStart; i <= rangeEnd; i++) {
      const timeHeight = dateGraph.totalTime[i] * yDevicePixelsPerHangMs;
      const countHeight = dateGraph.totalCount[i] * yDevicePixelsPerHangCount;
      const timeStartY = c.height - timeHeight;
      const countStartY = c.height - countHeight;
      ctx.fillStyle = '#7990c8';
      ctx.fillRect((i - rangeStart) * xDevicePixelsPerDay, timeStartY, xDevicePixelsPerDay * BAR_WIDTH_RATIO, timeHeight);
      ctx.fillStyle = '#a7b9e5';
      ctx.fillRect((i - rangeStart) * xDevicePixelsPerDay + (xDevicePixelsPerDay * BAR_WIDTH_RATIO), countStartY, xDevicePixelsPerDay * (1 - BAR_WIDTH_RATIO), countHeight);
    }
  }

  _getMaxGraphValues() {
    let { rangeStart, rangeEnd, dateGraph } = this.props;

    let maxHangMs = 0;
    let maxHangCount = 0;
    for (let i = rangeStart; i <= rangeEnd; i++) {
      if (dateGraph.totalTime[i] > maxHangMs) {
        maxHangMs = dateGraph.totalTime[i];
      }
      if (dateGraph.totalCount[i] > maxHangCount) {
        maxHangCount = dateGraph.totalCount[i];
      }
    }

    return { maxHangMs, maxHangCount };
  }

  _pickGraphItem(mouseX, mouseY, canvas) {
    const { rangeStart, rangeEnd, dateGraph, dates, usageHoursByDate } = this.props;
    const devicePixelRatio = canvas.ownerDocument ? canvas.ownerDocument.defaultView.devicePixelRatio : 1;
    const r = canvas.getBoundingClientRect();

    const rangeLength = rangeEnd - rangeStart + 1;
    const { maxHangMs, maxHangCount } = this._getMaxGraphValues();
    const xPxPerDay = r.width / rangeLength;
    const yPxPerHangMs = r.height / maxHangMs;
    const yPxPerHangCount = r.height / maxHangCount;

    const x = mouseX - r.left;
    const y = mouseY - r.top;
    const invertedY = r.height - y;

    const normalized = x / xPxPerDay;
    const floor = Math.floor(normalized);
    const fract = normalized - floor;
    const dateIndex = floor + rangeStart;
    const isCount = fract > BAR_WIDTH_RATIO;

    let hovered = false;
    if (isCount) {
      if (invertedY < dateGraph.totalCount[dateIndex] * yPxPerHangCount) {
        hovered = true;
      }
    } else {
      if (invertedY < dateGraph.totalTime[dateIndex] * yPxPerHangMs) {
        hovered = true;
      }
    }

    if (hovered) {
      return {
        countHovered: isCount,
        totalTime: dateGraph.totalTime[dateIndex],
        totalCount: dateGraph.totalCount[dateIndex],
        date: dates[dateIndex],
        usageHours: usageHoursByDate[dates[dateIndex]],
      }
    }

    return null;
  }

  _onMouseUp(e) {
    if (this.props.onClick) {
      const { rangeStart, rangeEnd } = this.props;
      const r = this.refs.canvas.getBoundingClientRect();

      const x = e.pageX - r.left;
      const time = rangeStart + x / r.width * (rangeEnd - rangeStart);
      this.props.onClick(time);
    }
  }

  _onMouseMove(e) {
    this.setState({
      mouseX: e.pageX,
      mouseY: e.pageY,
      pickedItem: this._pickGraphItem(e.clientX, e.clientY, this.refs.canvas),
    });
  }

  _onMouseOut(e) {
    this.setState({
      pickedItem: null
    });
  }

  render() {
    this._scheduleDraw();
    const { mouseX, mouseY, pickedItem } = this.state;
    return (
      <div className={this.props.className}
           onMouseMove={this._onMouseMove}
           onMouseOut={this._onMouseOut}>
        {pickedItem &&
          <Tooltip mouseX={mouseX} mouseY={mouseY}>
            <StackGraphTooltipContents {...pickedItem}/>
          </Tooltip>}
        <canvas className={classNames(`${this.props.className}Canvas`, 'threadStackGraphCanvas')}
                ref='canvas'
                onMouseUp={this._onMouseUp}/>
      </div>
    );
  }
}

function formatDate(dateStr /* yyyymmdd */) {
  let month = dateStr.substr(4, 2).replace(/^0/, '');
  let day = dateStr.substr(6, 2).replace(/^0/, '');
  return `${month}/${day}`;
}

function formatDecimal(decimalNumber) {
  if (decimalNumber >= 100) {
    return parseFloat(decimalNumber.toFixed(1)).toLocaleString();
  } else {
    return parseFloat(decimalNumber.toPrecision(3)).toLocaleString();
  }
}

class StackGraphTooltipContents extends PureComponent {
  render() {
    const { countHovered, date, totalTime, totalCount, className, usageHours } = this.props;

    return (
      <div className={classNames('tooltipMarker', className)}>
        <div className="tooltipHeader">
          <div>
            Build date: {formatDate(date)}
          </div>
          <div className={classNames('tooltipOneLine', 'totalTime')}>
            <div className="tooltipTiming">
              {formatDecimal(totalTime)}
            </div>
            <div className="tooltipTitle">
              ms/hr hanging in selected node
            </div>
          </div>
          <div className={classNames('tooltipOneLine', 'totalCount')}>
            <div className="tooltipTiming">
              {formatDecimal(totalCount)}
            </div>
            <div className="tooltipTitle">
              hangs/hr sampled in selected node
            </div>
          </div>
          <div className={classNames('tooltipOneLine', 'noColor')}>
            <div className="tooltipTiming">
              {Math.round(totalCount * usageHours).toLocaleString()}
            </div>
            <div className="tooltipTitle">
              samples collected
            </div>
          </div>
          <div className={classNames('tooltipOneLine', 'noColor')}>
            <div className="tooltipTiming">
              {formatDecimal(totalTime / totalCount)}
            </div>
            <div className="tooltipTitle">
              ms mean hang duration
            </div>
          </div>
        </div>
      </div>
    );
  }
}

ThreadStackGraph.propTypes = {
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  dateGraph: PropTypes.object.isRequired,
  dates: PropTypes.array.isRequired,
  usageHoursByDate: PropTypes.object.isRequired,
  className: PropTypes.string,
};

export default connect(state => ({
  dateGraph: getDateGraph(state),
  usageHoursByDate: getUsageHoursByDate(state),
}), actions)(ThreadStackGraph);
